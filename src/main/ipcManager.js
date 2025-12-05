const { ipcMain, shell, dialog, net } = require('electron');
const ConfigService = require('./services/ConfigService');
const CHANNELS = require('../shared/channels');
const crypto = require('crypto');

let licenseCache = { token: null, isValid: false, lastCheck: 0 };
const CACHE_DURATION = 3 * 60 * 60 * 1000;

function setupIPC(mainWindow, server, tikClient, battleService, giftService) {

    const sendLog = (msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(CHANNELS.APP.LOG, msg);
        }
        console.log(msg);
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

    // --- NUEVO: OBTENER ESTADO COMPLETO AL INICIO ---
    // Esto es lo que arregla el "Conectando..." infinito y los datos en 0
    ipcMain.on('request-full-state', (event) => {
        if (tikClient) {
            const fullState = tikClient.getFullState();
            // Respondemos inmediatamente con: { status: 'connected', stats: { taps: 100, ... } }
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

    ipcMain.on(CHANNELS.TEST.GLOBAL_GIFT, (event, points) => { if (tikClient) tikClient.testGlobalGift(parseInt(points)); });
    ipcMain.on(CHANNELS.TEST.TAPS, (event, amount) => { if (tikClient) tikClient.testTaps(parseInt(amount)); });
    ipcMain.on(CHANNELS.TEST.GIFT, (event, data) => {
        if (battleService) {
            const prev = battleService.state.config.allow_gifts_off_timer;
            battleService.state.config.allow_gifts_off_timer = true;
            battleService.addPoints(data.teamId, parseInt(data.points));
            if (tikClient) tikClient.testBattleGift(data.teamId, parseInt(data.points));
            battleService.state.config.allow_gifts_off_timer = prev;
        }
    });
    ipcMain.on(CHANNELS.TEST.SHARE, (event, amount) => { if (tikClient) tikClient.testShare(parseInt(amount)); });

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
    ipcMain.on('select-team-icon', async (e, i) => { const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Img', extensions: ['jpg','png','gif'] }] }); if (!r.canceled) e.reply('icon-selected', { index: i, path: r.filePaths[0] }); });
}

module.exports = { setupIPC };