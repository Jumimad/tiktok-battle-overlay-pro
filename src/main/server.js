const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');

function setupServer(mainWindow) {
    const appExpress = express();
    const server = http.createServer(appExpress);
    const wss = new WebSocket.Server({ server });

    appExpress.use(cors());

    // Ruta de archivos públicos (Overlay)
    const publicPath = path.join(__dirname, '../../public');

    appExpress.use(express.static(publicPath));

    // --- SOLUCIÓN AL ERROR DE IMÁGENES LOCALES ---
    // Creamos una ruta especial que lee el archivo del disco y lo entrega al navegador
    appExpress.get('/local-image', (req, res) => {
        const imgPath = req.query.path;
        if (imgPath && fs.existsSync(imgPath)) {
            res.sendFile(imgPath);
        } else {
            res.status(404).send('Imagen no encontrada');
        }
    });

    // Estado Global en Memoria
    let state = {
        scores: {},
        streamScores: {},
        config: {},
        timer: { running: false, seconds: 0, paused: false }
    };

    const broadcast = (msg) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msg));
            }
        });
    };

    wss.on('connection', (ws) => {
        if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log', '[SERVER] Overlay conectado.');

        // Enviar estado inicial al conectar
        ws.send(JSON.stringify({ type: 'config', data: state.config }));
        if(state.scores) ws.send(JSON.stringify({ type: 'scores', data: state.scores }));
        if(state.streamScores) ws.send(JSON.stringify({ type: 'stream_scores', data: state.streamScores }));
        if(state.timer) ws.send(JSON.stringify({ type: 'TIMER_UPDATE', data: state.timer }));
    });

    const PORT = 8080;
    server.listen(PORT, '0.0.0.0', () => {
        if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log', `[SERVER] Online puerto ${PORT}`);
    });

    return { server, broadcast, state };
}



module.exports = { setupServer };