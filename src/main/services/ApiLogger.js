const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LOG_PATH = path.join(app.getPath('desktop'), 'TIKTOK_DATA_ANALYSIS.jsonl');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function rotateLogIfNeeded() {
    try {
        if (fs.existsSync(LOG_PATH)) {
            const stats = fs.statSync(LOG_PATH);
            if (stats.size > MAX_SIZE) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = path.join(app.getPath('desktop'), `TIKTOK_DATA_BACKUP_${timestamp}.jsonl`);
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