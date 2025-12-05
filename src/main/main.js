// AÑADIDO: 'ipcMain' en los imports para escuchar los comandos de actualización
const { app, BrowserWindow, Menu, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { initializeServices } = require('./initializeServices');
const { setupIPC } = require('./ipcManager');
const url = require('url');

// --- UPDATE LOGIC: IMPORTAR LA LIBRERÍA ---
const { autoUpdater } = require('electron-updater');

// Configuración del actualizador
autoUpdater.autoDownload = false; // No descargar solo, esperar a que el usuario diga "Sí"
autoUpdater.logger = console; // Para ver errores en la consola

// 1. REGISTRO DE PROTOCOLO PRIVILEGIADO (Antes de app.ready)
protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true // ¡AHORA SÍ ES SEGURO! 🛡️
        },
        icon: path.join(__dirname, '../../public/app_icon.ico')
    });

    const isDev = !app.isPackaged;
    let startUrl;

    if (isDev) {
        startUrl = 'http://localhost:3000';
    } else {
        startUrl = `file://${path.join(__dirname, '../../build/index.html')}`;
    }

    console.log(`[MAIN] Cargando URL: ${startUrl}`);
    mainWindow.loadURL(startUrl).catch(e => {
        console.error("[MAIN] Error cargando URL:", e);
        if (isDev) {
            mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));
        }
    });

    // mainWindow.webContents.openDevTools();

    const { server, tikClient, battleService, giftService } = initializeServices(mainWindow);
    setupIPC(mainWindow, server, tikClient, battleService, giftService);
}

app.whenReady().then(() => {

    // 2. MANEJADOR DEL PROTOCOLO media://
    protocol.handle('media', (request) => {
        const filePath = request.url.slice('media://'.length);
        const decodedPath = decodeURIComponent(filePath);
        return net.fetch(url.pathToFileURL(decodedPath).toString());
    });

    Menu.setApplicationMenu(null);
    createWindow();

    // --- UPDATE LOGIC: BUSCAR ACTUALIZACIÓN AL INICIAR ---
    if (app.isPackaged) { // Solo buscar updates si ya está compilado (.exe)
        autoUpdater.checkForUpdates();
    }
});

// --- UPDATE LOGIC: EVENTOS DEL ACTUALIZADOR ---

// 1. Si encuentra una actualización, avisa a la ventana (React)
autoUpdater.on('update-available', (info) => {
    console.log("Actualización encontrada:", info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_available', info.version);
    }
});

// 2. Si ya se descargó, avisa que está lista
autoUpdater.on('update-downloaded', () => {
    console.log("Actualización descargada.");
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_downloaded');
    }
});

// 3. Recibir orden de React para EMPEZAR a descargar
ipcMain.on('start-download', () => {
    autoUpdater.downloadUpdate();
});

// 4. Recibir orden de React para INSTALAR y reiniciar
ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

// --- FIN UPDATE LOGIC ---

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});