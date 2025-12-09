// src/main/tikfinity.js
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const GameLogic = require('./services/GameLogic'); // Importamos la lógica

class TikFinityClient {
    constructor(broadcastCallback, stateManager, logger) {
        this.broadcast = broadcastCallback;
        this.state = stateManager;
        this.logger = logger || console.log;

        // Instanciamos el Cerebro Lógico
        this.gameLogic = new GameLogic(broadcastCallback, stateManager);

        // Variables de Conexión
        this.ws = null;
        this.reconnectInterval = 3000;
        this.connectedUrl = '';
        this.isLicensed = false;
        this.connectionState = 'disconnected';
        this.isConnecting = false;
        this.socketOpen = false;

        // Log path (para errores de conexión)
        try { this.logPath = path.join(app.getPath('desktop'), 'TIKFINITY_CONN_LOG.txt'); } catch(e){}

        // Heartbeat de Conexión
        this.gameLogic.lastDataTime = 0;
        setInterval(() => { this.broadcastSmartStatus(); }, 1000);
    }

    logToFile(text) { try { fs.appendFileSync(this.logPath, text + '\n'); } catch (e) { } }

    // --- ESTADO DE CONEXIÓN ---
    broadcastSmartStatus() {
        let smartStatus = 'disconnected';
        if (this.socketOpen) {
            const now = Date.now();
            const ACTIVITY_TIMEOUT = 60000;
            smartStatus = (now - this.gameLogic.lastDataTime < ACTIVITY_TIMEOUT) ? 'active' : 'waiting';
        } else if (this.isConnecting) {
            smartStatus = 'connecting';
        }
        this.broadcast({ type: 'APP_STATUS', data: { status: smartStatus } });
    }

    getFullState() {
        const statusData = this.socketOpen
            ? (Date.now() - this.gameLogic.lastDataTime < 60000 ? 'active' : 'waiting')
            : (this.isConnecting ? 'connecting' : 'disconnected');

        return {
            status: statusData,
            stats: {
                taps: this.state.totalTaps,
                diamonds: this.state.stats.totalDiamonds,
                shares: this.state.stats.totalShares
            }
        };
    }

    // --- GESTIÓN DE CONFIGURACIÓN ---
    setLicenseStatus(isValid) {
        this.isLicensed = isValid;
        if (isValid && this.state.config) this.updateConfig(this.state.config);
        else if (!isValid && this.ws) { try{this.ws.close();}catch(e){} this.ws=null; }
    }

    updateConfig(config) {
        this.state.config = config;
        // Pasamos config a GameLogic si fuera necesario (él usa state.config directamente)
        if (!this.isLicensed) return;

        let newUrl = config.tikfinity_ws_url || "ws://127.0.0.1:21213/";
        if (newUrl.includes('localhost')) newUrl = newUrl.replace('localhost', '127.0.0.1');

        if (!this.ws || this.connectedUrl !== newUrl || this.ws.readyState === WebSocket.CLOSED) {
            this.connectedUrl = newUrl;
            this.connect();
        }
        // Si reconectamos, refrescamos stats
        this.gameLogic.emitAllStats();
    }

    // --- GESTIÓN DEL SOCKET ---
    connect() {
        if (!this.isLicensed || this.socketOpen || this.isConnecting) return;

        const url = this.connectedUrl || "ws://127.0.0.1:21213/";
        this.isConnecting = true;
        this.broadcastSmartStatus();

        try { this.ws = new WebSocket(url); }
        catch (e) { this.isConnecting = false; return; }

        this.ws.on('open', () => {
            this.isConnecting = false;
            this.socketOpen = true;
            this.logger('[CONEXIÓN] TikFinity OK.');
            this.broadcastSmartStatus();
            this.gameLogic.emitAllStats();
        });

        this.ws.on('message', (data) => {
            if (!this.isLicensed) return;
            // Registrar actividad para el Heartbeat
            this.gameLogic.lastDataTime = Date.now();
            try {
                const json = JSON.parse(data.toString());
                const payload = json.data ? (json.data.data || json.data) : json;
                const eventType = (json.event || json.type || (json.data && json.data.event) || '').toLowerCase();

                // DELEGAMOS LA LÓGICA
                this.gameLogic.processEvent(eventType, payload);
            } catch (e) { console.error("[TIK] JSON Error"); }
        });

        this.ws.on('close', () => {
            this.isConnecting = false;
            this.socketOpen = false;
            this.broadcastSmartStatus();
            this.ws = null;
            if (this.isLicensed) setTimeout(() => { this.connect(); }, this.reconnectInterval);
        });

        this.ws.on('error', () => { this.isConnecting = false; this.socketOpen = false; });
    }

    // --- PUENTES PARA IPC (PRUEBAS Y RESET) ---
    // Mantenemos estos métodos para no romper ipcManager.js
    // Simplemente llaman a GameLogic.
    testGlobalGift(p) { this.gameLogic.lastDataTime = Date.now(); this.gameLogic.processEvent('gift', { giftName: 'TEST_GLOBAL', diamondCount: parseInt(p), repeatCount: 1 }); }
    testTaps(a) { this.gameLogic.lastDataTime = Date.now(); this.gameLogic.processEvent('like', { likeCount: parseInt(a), totalLikeCount: this.state.totalTaps + parseInt(a) }); }
    testShare(a) { this.gameLogic.lastDataTime = Date.now(); this.gameLogic.processEvent('share', { amount: parseInt(a) }); }
    testBattleGift(teamId, p) {
        // Simulación manual para batalla específica
        this.gameLogic.lastDataTime = Date.now();
        const pts = parseInt(p);
        this.state.stats.totalDiamonds += pts;
        this.gameLogic.checkPointGoal();
        this.gameLogic.emitModule1();

        if (!this.state.streamScores[teamId]) this.state.streamScores[teamId] = 0;
        this.state.streamScores[teamId] += pts;

        if (!this.state.scores[teamId]) this.state.scores[teamId] = 0;
        this.state.scores[teamId] += pts;

        this.broadcast({ type: 'scores', data: this.state.scores });
        this.broadcast({ type: 'stream_scores', data: this.state.streamScores });
        this.gameLogic.emitPanelStats();
    }

    startNewSession() { this.gameLogic.startNewSession(); }
    recalculateTapProgress() { this.gameLogic.recalculateTapProgress(); }
    getConnectionStatus() { return this.getFullState().status; }
}

module.exports = { TikFinityClient };