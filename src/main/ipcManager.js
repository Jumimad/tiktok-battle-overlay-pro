const { ipcMain, shell, dialog, net, app, nativeImage } = require('electron'); // Añadido nativeImage y app
const ConfigService = require('./services/ConfigService');
const CHANNELS = require('../shared/channels');
const crypto = require('crypto');
const path = require('path'); // Añadido path
const fs = require('fs'); // Añadido fs

let licenseCache = { token: null, isValid: false, lastCheck: 0 };
const CACHE_DURATION = 3 * 60 * 60 * 1000;

function setupIPC(mainWindow, server, tikClient, battleService, giftService) {

    const sendLog = (msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(CHANNELS.APP.LOG, msg);
        }
        console.log(msg);
    };

    // --- FUNCIÓN DE OPTIMIZACIÓN DE IMÁGENES ---
    const optimizeImage = async (originalPath) => {
        try {
            const stats = fs.statSync(originalPath);
            const fileSizeMB = stats.size / (1024 * 1024);

            // Si es pequeña (< 2MB), la usamos directo
            if (fileSizeMB < 2) return originalPath;

            sendLog(`[IMG] Optimizando imagen grande (${fileSizeMB.toFixed(1)} MB)...`);

            // Usamos nativeImage para redimensionar
            const image = nativeImage.createFromPath(originalPath);
            const size = image.getSize();

            // Si es gigante (> 1000px), la reducimos
            if (size.width > 1000 || size.height > 1000) {
                const resized = image.resize({ width: 1000, quality: 'good' });
                const buffer = resized.toPNG();

                // Guardamos en carpeta temporal de usuario
                const optimizedDir = path.join(app.getPath('userData'), 'optimized_images');
                if (!fs.existsSync(optimizedDir)) fs.mkdirSync(optimizedDir);

                const fileName = `opt_${Date.now()}_${path.basename(originalPath)}`;
                const newPath = path.join(optimizedDir, fileName);

                fs.writeFileSync(newPath, buffer);
                sendLog(`[IMG] Optimizada y guardada en: ${newPath}`);
                return newPath;
            }
            return originalPath;
        } catch (e) {
            console.error("Error optimizando imagen:", e);
            return originalPath; // En caso de error, devolvemos la original
        }
    };

    const getDeviceId = () => {
        try {
            const config = ConfigService.get();
            if (config.device_id && config.device_id.length > 5) return config.device_id;
            let newId;
            try { newId = crypto.randomUUID(); } catch (e) { newId = 'device-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
            config.device_id = newId;
            ConfigService.save(config);
            return newId;
        } catch (err) { return "error-generating-id"; }
    };

    const validateToken = (token, force = false) => {
        return new Promise((resolve) => {
            const now = Date.now();
            if (!token) { resolve({ valid: false }); return; }
            const tokenLimpio = token.trim();
            if (!force && licenseCache.token === tokenLimpio && licenseCache.isValid && (now - licenseCache.lastCheck < CACHE_DURATION)) {
                resolve({ valid: true }); return;
            }
            const deviceId = getDeviceId();
            const BASE_URL = "https://niicolenco.tv/validar_token.php";
            const urlCompleta = `${BASE_URL}?token=${encodeURIComponent(tokenLimpio)}&device_id=${encodeURIComponent(deviceId)}&nocache=${now}`;
            const request = net.request({ method: 'GET', url: urlCompleta });
            request.setHeader('User-Agent', 'TikBattle/2.0');
            request.on('response', (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk.toString());
                response.on('end', () => {
                    try {
                        const json = JSON.parse(data.trim());
                        const isValid = (json && json.valid === true);
                        licenseCache = { token: tokenLimpio, isValid: isValid, lastCheck: Date.now() };
                        resolve({ valid: isValid, reason: isValid ? null : json.message });
                    } catch (e) { resolve({ valid: false, reason: "Error de comunicación" }); }
                });
            });
            request.on('error', () => resolve({ valid: false, reason: "Error de conexión" }));
            request.end();
        });
    };

    const updateTikClientLicense = (isValid) => {
        if (tikClient) {
            if (typeof tikClient.setLicenseStatus === 'function') tikClient.setLicenseStatus(isValid);
            else tikClient.isLicensed = isValid;
        }
    };

    ipcMain.handle('license:login', async (event, token) => {
        try {
            const result = await validateToken(token, true);
            if (result.valid) {
                const conf = ConfigService.get();
                conf.license_key = token;
                await ConfigService.save(conf);
                updateTikClientLicense(true);
                if (tikClient) tikClient.updateConfig(conf);
                return { success: true };
            } else {
                updateTikClientLicense(false);
                return { success: false, error: result.reason };
            }
        } catch (err) { return { success: false, error: "Error interno" }; }
    });

    // --- OBTENER ESTADO COMPLETO AL INICIO ---
    ipcMain.on('request-full-state', (event) => {
        if (tikClient) {
            const fullState = tikClient.getFullState();
            event.reply('full-state-data', fullState);
        }
    });

    ipcMain.on('request-config', async (event) => {
        const conf = ConfigService.get();
        let isValid = false;

        if (conf.license_key) {
            const res = await validateToken(conf.license_key, false);
            isValid = res.valid;
            const wasLicensed = tikClient.isLicensed;
            if (isValid && !wasLicensed) {
                updateTikClientLicense(true);
                if (tikClient) tikClient.updateConfig(conf);
            } else if (!isValid && wasLicensed) {
                updateTikClientLicense(false);
            }
        } else {
            updateTikClientLicense(false);
        }

        event.reply('config-loaded', conf);
        event.reply('license-status', isValid);

        // --- ENVIAR VERSIÓN DE LA APP AL FOOTER ---
        event.reply('app-version', app.getVersion());
    });

    ipcMain.on(CHANNELS.CONFIG.SAVE, async (event, config) => {
        const oldC = ConfigService.get();
        const changedLicense = config.license_key !== oldC.license_key;
        const changedUrl = config.tikfinity_ws_url !== oldC.tikfinity_ws_url;
        const newC = await ConfigService.save(config);

        if (newC.license_key) {
            const res = await validateToken(newC.license_key, changedLicense);
            updateTikClientLicense(res.valid);
            event.reply('license-status', res.valid);
        }
        if (tikClient && (changedUrl || changedLicense)) {
            tikClient.updateConfig(newC);
        }
        if (server && server.state) server.state.config = newC;
        if (server) server.broadcast({ type: 'config', data: newC });

        event.reply(CHANNELS.CONFIG.UPDATED, newC);
    });

    ipcMain.on(CHANNELS.PROFILES.GET_ALL, (e) => { e.reply(CHANNELS.PROFILES.LIST_UPDATED, ConfigService.getProfiles()); });
    ipcMain.on(CHANNELS.PROFILES.SAVE, async (e, name) => { if(ConfigService.saveProfile(name)) e.reply(CHANNELS.PROFILES.LIST_UPDATED, ConfigService.getProfiles()); });
    ipcMain.on(CHANNELS.PROFILES.LOAD, async (e, name) => {
        const newConfig = ConfigService.loadProfile(name);
        if (newConfig) {
            if (tikClient) tikClient.updateConfig(newConfig);
            if (server) { server.state.config = newConfig; server.broadcast({ type: 'config', data: newConfig }); }
            e.reply('config-loaded', newConfig);
            e.reply(CHANNELS.CONFIG.UPDATED, newConfig);
        }
    });
    ipcMain.on(CHANNELS.PROFILES.DELETE, (e, name) => { ConfigService.deleteProfile(name); e.reply(CHANNELS.PROFILES.LIST_UPDATED, ConfigService.getProfiles()); });

    // Test events (pasan a traves de tikfinity wrapper)
    ipcMain.on(CHANNELS.TEST.GLOBAL_GIFT, (event, points) => { if (tikClient) tikClient.testGlobalGift(parseInt(points)); });
    ipcMain.on(CHANNELS.TEST.TAPS, (event, amount) => { if (tikClient) tikClient.testTaps(parseInt(amount)); });
    ipcMain.on(CHANNELS.TEST.SHARE, (event, amount) => { if (tikClient) tikClient.testShare(parseInt(amount)); });
    ipcMain.on(CHANNELS.TEST.GIFT, (event, data) => {
        if (battleService) {
            const prev = battleService.state.config.allow_gifts_off_timer;
            battleService.state.config.allow_gifts_off_timer = true;
            battleService.addPoints(data.teamId, parseInt(data.points));
            if (tikClient) tikClient.testBattleGift(data.teamId, parseInt(data.points));
            battleService.state.config.allow_gifts_off_timer = prev;
        }
    });

    // Battle events
    ipcMain.on(CHANNELS.BATTLE.START, (ev, s) => { if(battleService) battleService.startBattle(s); });
    ipcMain.on(CHANNELS.BATTLE.STOP, () => { if(battleService) battleService.stopBattle(); });
    ipcMain.on(CHANNELS.BATTLE.PAUSE, () => { if(battleService) battleService.togglePause(); });
    ipcMain.on(CHANNELS.BATTLE.ADD_TIME, (ev, s) => { if(battleService) battleService.addTime(parseInt(s)); });
    ipcMain.on(CHANNELS.BATTLE.RESET_SCORES, () => { if(battleService) battleService.resetScores('battle'); });
    ipcMain.on(CHANNELS.BATTLE.RESET_STREAM, () => { if(battleService) battleService.resetScores('stream'); });
    ipcMain.on(CHANNELS.BATTLE.RESET_TAPS, () => { if (tikClient) tikClient.recalculateTapProgress(); });
    ipcMain.on(CHANNELS.BATTLE.RESET_POINTS, () => { if (tikClient) tikClient.startNewSession(); if (battleService) battleService.resetScores('stream'); });
    ipcMain.on(CHANNELS.BATTLE.RESET_SESSION, () => { if (tikClient) tikClient.startNewSession(); if (battleService) { battleService.resetScores('battle'); battleService.resetScores('stream'); } });

    ipcMain.on(CHANNELS.GIFTS.GET_ALL, async (e) => { try { const c = ConfigService.get(); const g = await giftService.fetchGifts(c.gift_lang||'es-419'); e.reply(CHANNELS.GIFTS.LIST_UPDATED, g); } catch(x) { e.reply(CHANNELS.GIFTS.LIST_UPDATED, []); } });
    ipcMain.on(CHANNELS.APP.OPEN_OVERLAY, (e, f) => { const p = ConfigService.get().server_port || 8080; shell.openExternal(`http://localhost:${p}/${f}`); });

    // --- SELECCIÓN DE ICONO CON OPTIMIZACIÓN ---
    ipcMain.on('select-team-icon', async (e, i) => {
        const r = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Img', extensions: ['jpg','png','gif','jpeg'] }]
        });
        if (!r.canceled) {
            // OPTIMIZACIÓN AUTOMÁTICA AQUÍ
            const originalPath = r.filePaths[0];
            const finalPath = await optimizeImage(originalPath);
            e.reply('icon-selected', { index: i, path: finalPath });
        }
    });
}

module.exports = { setupIPC };