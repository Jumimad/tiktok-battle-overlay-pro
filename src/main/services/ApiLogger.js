const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 1. OBTENER RUTA INTERNA (NO EL ESCRITORIO)
const userDataPath = app.getPath('userData');

// 2. CREAR CARPETA 'logs' PARA ORDEN
const logsDir = path.join(userDataPath, 'logs');
if (!fs.existsSync(logsDir)) {
    try {
        fs.mkdirSync(logsDir, { recursive: true });
    } catch (e) {
        console.error("No se pudo crear carpeta de logs:", e);
    }
}

// 3. DEFINIR EL ARCHIVO DENTRO DE ESA CARPETA
const LOG_PATH = path.join(logsDir, 'TIKTOK_DATA_ANALYSIS.jsonl');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function rotateLogIfNeeded() {
    try {
        if (fs.existsSync(LOG_PATH)) {
            const stats = fs.statSync(LOG_PATH);
            if (stats.size > MAX_SIZE) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                // Guardamos el backup en la misma carpeta ordenada
                const backupPath = path.join(logsDir, `TIKTOK_DATA_BACKUP_${timestamp}.jsonl`);
                fs.renameSync(LOG_PATH, backupPath);
                console.log("[LOGGER] Log rotado por tamaño excesivo.");
            }
        }
    } catch (e) {
        console.error("[LOGGER] Error rotando logs:", e);
    }
}

// Verificamos al cargar el módulo
rotateLogIfNeeded();

function logEvent(type, data) {
    try {
        const record = {
            timestamp: new Date().toLocaleString(),
            type: type,
            data: data
        };
        const line = JSON.stringify(record) + '\n';

        // Verificamos tamaño ocasionalmente (simple check)
        if (Math.random() < 0.01) rotateLogIfNeeded();

        fs.appendFileSync(LOG_PATH, line);
    } catch (error) {
        console.error("Error guardando datos para análisis:", error);
    }
}

module.exports = { logEvent };