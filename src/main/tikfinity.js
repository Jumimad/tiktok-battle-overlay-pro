const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { logEvent } = require('./services/ApiLogger');

class TikFinityClient {
    constructor(broadcastCallback, stateManager, logger) {
        this.broadcast = broadcastCallback;
        this.state = stateManager;
        this.logger = logger || console.log;
        this.ws = null;
        this.reconnectInterval = 3000;
        this.connectedUrl = '';
        this.isLicensed = false;

        // Estado interno de conexión (Socket real)
        this.socketOpen = false;
        this.isConnecting = false;

        // --- MONITOR DE ACTIVIDAD ---
        this.lastDataTime = 0; // Última vez que recibimos algo
        this.ACTIVITY_TIMEOUT = 60000; // 1 Minuto en milisegundos

        this.saveTimeout = null;

        try {
            const userDataPath = app.getPath('userData');
            this.sessionFile = path.join(userDataPath, 'session_stats.json');
            this.usersDbFile = path.join(userDataPath, 'session_users.json');
            this.logPath = path.join(app.getPath('desktop'), 'TIKFINITY_LOG.txt');
        } catch (e) { console.error(e); }

        this.state.totalTaps = 0;
        this.state.stats = { totalDiamonds: 0, totalShares: 0 };
        this.userTracker = {};
        this.currentTapGoalIndex = 0;
        this.currentPointGoalIndex = 0;
        this.tapGoalJustMet = false;
        this.pointGoalJustMet = false;

        this.loadSession();

        // --- HEARTBEAT INTELIGENTE ---
        // Se ejecuta cada segundo para actualizar el estado en tiempo real
        setInterval(() => {
            this.broadcastSmartStatus();
        }, 1000);
    }

    logToFile(text) { try { fs.appendFileSync(this.logPath, text + '\n'); } catch (e) { } }

    // --- CEREBRO DEL ESTADO ---
    broadcastSmartStatus() {
        let smartStatus = 'disconnected';

        if (this.socketOpen) {
            const now = Date.now();
            // Si hubo datos hace menos de 1 minuto -> ACTIVE (Verde)
            if (now - this.lastDataTime < this.ACTIVITY_TIMEOUT) {
                smartStatus = 'active';
            }
            // Si estamos conectados pero nadie escribe -> WAITING (Amarillo)
            else {
                smartStatus = 'waiting';
            }
        } else if (this.isConnecting) {
            smartStatus = 'connecting';
        }

        this.broadcast({
            type: 'APP_STATUS',
            data: { status: smartStatus }
        });
    }

    getFullState() {
        // Ejecutamos la lógica para devolver el estado actual exacto
        let smartStatus = 'disconnected';
        if (this.socketOpen) {
            const now = Date.now();
            smartStatus = (now - this.lastDataTime < this.ACTIVITY_TIMEOUT) ? 'active' : 'waiting';
        } else if (this.isConnecting) {
            smartStatus = 'connecting';
        }

        return {
            status: smartStatus,
            stats: {
                taps: this.state.totalTaps,
                diamonds: this.state.stats.totalDiamonds,
                shares: this.state.stats.totalShares
            }
        };
    }

    setLicenseStatus(isValid) {
        this.isLicensed = isValid;
        if (isValid) {
            this.logger("[CEREBRO] Licencia OK. Iniciando...");
            if (this.state.config) this.updateConfig(this.state.config);
        } else {
            if (this.ws) { try { this.ws.close(); } catch(e){} this.ws = null; }
        }
    }

    updateConfig(config) {
        this.state.config = config;
        if (!this.isLicensed) return;

        let newUrl = config.tikfinity_ws_url || "ws://127.0.0.1:21213/";
        if (newUrl.includes('localhost')) newUrl = newUrl.replace('localhost', '127.0.0.1');

        if (!this.ws || this.connectedUrl !== newUrl || this.ws.readyState === WebSocket.CLOSED) {
            this.connectedUrl = newUrl;
            this.connect();
        }
    }

    connect() {
        if (!this.isLicensed) return;
        if (this.socketOpen) return; // Ya estamos conectados
        if (this.isConnecting) return;

        const url = this.connectedUrl || "ws://127.0.0.1:21213/";

        this.isConnecting = true;
        this.broadcastSmartStatus();

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            this.isConnecting = false;
            this.socketOpen = false;
            return;
        }

        this.ws.on('open', () => {
            this.isConnecting = false;
            this.socketOpen = true; // Marcamos conexión real
            this.logger('[CEREBRO] Conectado a TikFinity.');
            this.broadcastSmartStatus();
            this.emitAllStats();
        });

        this.ws.on('message', (data) => {
            if (!this.isLicensed) return;
            try {
                const json = JSON.parse(data.toString());
                this.processMessage(json);
            } catch (e) { console.error("[TIK] JSON Error"); }
        });

        this.ws.on('close', () => {
            this.isConnecting = false;
            this.socketOpen = false;
            this.broadcastSmartStatus();
            this.ws = null;
            if (this.isLicensed) setTimeout(() => { this.connect(); }, this.reconnectInterval);
        });

        this.ws.on('error', () => {
            this.isConnecting = false;
            this.socketOpen = false;
        });
    }

    processMessage(msg) {
        if (!this.isLicensed || !msg) return;

        // --- REGISTRAR ACTIVIDAD ---
        // Cada vez que entra un mensaje válido, actualizamos el reloj
        this.lastDataTime = Date.now();
        // ---------------------------

        logEvent(msg.event || 'unknown', msg);

        let payload = msg;
        if (msg.data) {
            payload = msg.data;
            if (payload.data) payload = payload.data;
        }

        const eventType = (msg.event || msg.type || (msg.data && msg.data.event) || '').toLowerCase();
        let sessionChanged = false;

        if (eventType.includes('like')) {
            const serverTotal = parseInt(payload.totalLikeCount || payload.totalLikes || -1);
            const batchLikes = parseInt(payload.likeCount || payload.likes || payload.count || 0);

            if (!isNaN(serverTotal) && serverTotal > this.state.totalTaps) {
                this.state.totalTaps = serverTotal;
                sessionChanged = true;
            }
            else if (batchLikes > 0) {
                this.state.totalTaps += batchLikes;
                sessionChanged = true;
            }

            if (sessionChanged) {
                this.checkTapGoal();
                this.emitModule2();
                this.emitPanelStats();
                this.saveSession();
            }
        }
        else if (eventType.includes('share')) {
            const amount = parseInt(payload.amount || 1);
            this.state.stats.totalShares += amount;
            this.emitPanelStats();
            this.saveSession();
        }
        else if (eventType.includes('gift')) {
            if (payload.giftType === 1 && !payload.repeatEnd) return;

            const giftName = (payload.giftName || '').toLowerCase().trim();
            const points = (payload.diamondCount || 0) * (payload.repeatCount || 1);

            if (points > 0) {
                console.log(`[GIFT] ${giftName} (+${points})`);
                this.state.stats.totalDiamonds += points;
                this.checkPointGoal();
                this.emitModule1();

                const teamId = this.findTeamIdByGift(giftName);
                if (teamId) {
                    if (!this.state.streamScores[teamId]) this.state.streamScores[teamId] = 0;
                    this.state.streamScores[teamId] += points;

                    if (this.state.timer.running || (this.state.config.allow_gifts_off_timer === true)) {
                        if (!this.state.scores[teamId]) this.state.scores[teamId] = 0;
                        this.state.scores[teamId] += points;
                        this.broadcast({ type: 'scores', data: this.state.scores });
                    }
                    this.broadcast({ type: 'stream_scores', data: this.state.streamScores });
                }
                this.emitPanelStats();
                this.saveSession();
            }
        }
    }

    emitModule1() { const state = this.calculateTotalPointsState(); this.broadcast({ type: 'TOTAL_POINTS_UPDATE', data: state }); this.pointGoalJustMet = false; }
    emitModule2() { const state = this.calculateTapState(); this.broadcast({ type: 'TAPS_UPDATE', data: state }); this.tapGoalJustMet = false; }
    emitPanelStats() { this.broadcast({ type: 'STATS_UPDATE', data: { taps: this.state.totalTaps, diamonds: this.state.stats.totalDiamonds, shares: this.state.stats.totalShares } }); }
    emitAllStats() { this.emitModule1(); this.emitModule2(); this.emitPanelStats(); }

    checkTapGoal() {
        const goals = this.state.config.layout?.tap_goals || [];
        if (!goals.length) return;
        let newIndex = 0;
        for (let i = 0; i < goals.length; i++) {
            if (this.state.totalTaps >= parseInt(goals[i].taps)) newIndex = i + 1;
            else { newIndex = i; break; }
        }
        if (newIndex > this.currentTapGoalIndex && newIndex > 0) this.tapGoalJustMet = true;
        this.currentTapGoalIndex = newIndex;
    }
    calculateTapState() {
        const goals = this.state.config.layout?.tap_goals || [];
        const color = this.state.config.layout?.tap_heart_color || '#FF00FF';
        const total = this.state.totalTaps;
        if (!goals.length) return { currentTaps: total, currentGoalTaps: 10000, percent: (total/10000)*100, currentGoalName: "Infinito", nextGoalName: "", fillColor: color, goalJustMet: false };
        if (this.currentTapGoalIndex >= goals.length) return { currentTaps: total, currentGoalTaps: parseInt(goals[goals.length-1].taps), percent: 100, currentGoalName: "¡Completado!", nextGoalName: "Máximo", fillColor: color, goalJustMet: this.tapGoalJustMet };
        const cur = goals[this.currentTapGoalIndex];
        const prev = this.currentTapGoalIndex > 0 ? parseInt(goals[this.currentTapGoalIndex-1].taps) : 0;
        const range = parseInt(cur.taps) - prev;
        const progress = total - prev;
        let percent = 0; if (range > 0) percent = (progress / range) * 100;
        return { currentTaps: total, currentGoalTaps: parseInt(cur.taps), currentGoalName: cur.name, nextGoalName: `Siguiente: ${goals[this.currentTapGoalIndex+1]?.name || "Final"}`, percent: Math.min(Math.max(percent, 0), 100), fillColor: color, goalJustMet: this.tapGoalJustMet };
    }
    checkPointGoal() {
        const goals = this.state.config.layout?.total_point_goals || [];
        if (!goals.length) return;
        const total = this.state.stats.totalDiamonds;
        let newIndex = 0;
        for (let i = 0; i < goals.length; i++) { if (total >= parseInt(goals[i].points)) newIndex = i + 1; else { newIndex = i; break; } }
        if (newIndex > this.currentPointGoalIndex && newIndex > 0) this.pointGoalJustMet = true;
        this.currentPointGoalIndex = newIndex;
    }
    calculateTotalPointsState() {
        const goals = this.state.config.layout?.total_point_goals || [];
        const color = this.state.config.layout?.total_goal_color || '#FFD700';
        const total = this.state.stats.totalDiamonds;
        if (!goals.length) return { currentPoints: total, currentGoalPoints: 50000, percent: (total/50000)*100, currentGoalName: "Infinito", fillColor: color, goalJustMet: false };
        if (this.currentPointGoalIndex >= goals.length) return { currentPoints: total, currentGoalPoints: parseInt(goals[goals.length-1].points), percent: 100, currentGoalName: "¡Completado!", fillColor: color, goalJustMet: this.pointGoalJustMet };
        const cur = goals[this.currentPointGoalIndex];
        const prev = this.currentPointGoalIndex > 0 ? parseInt(goals[this.currentPointGoalIndex-1].points) : 0;
        const range = parseInt(cur.points) - prev;
        const progress = total - prev;
        let percent = 0; if (range > 0) percent = (progress / range) * 100;
        return { currentPoints: total, currentGoalPoints: parseInt(cur.points), currentGoalName: cur.name, nextGoalName: `Siguiente: ${goals[this.currentPointGoalIndex+1]?.name || "Final"}`, percent: Math.min(Math.max(percent, 0), 100), fillColor: color, goalJustMet: this.pointGoalJustMet };
    }
    findTeamIdByGift(giftName) {
        if(!giftName) return null;
        const teams = this.state.config.teams || [];
        const team = teams.find(t => t.giftName && t.giftName.toLowerCase().trim() === giftName);
        return team ? team.id : null;
    }
    saveSession() { if (this.saveTimeout) clearTimeout(this.saveTimeout); this.saveTimeout = setTimeout(() => { this._writeSessionToDisk(); }, 3000); }
    _writeSessionToDisk() { if(this.sessionFile) { try{ fs.writeFileSync(this.sessionFile, JSON.stringify({ stats: this.state.stats, totalTaps: this.state.totalTaps })); }catch(e){} } if(this.usersDbFile) { try { fs.writeFileSync(this.usersDbFile, JSON.stringify(this.userTracker)); } catch(e){} } }
    loadSession() { if(this.sessionFile && fs.existsSync(this.sessionFile)){ try{ const d = JSON.parse(fs.readFileSync(this.sessionFile)); if(d.stats) this.state.stats = d.stats; if(d.totalTaps) this.state.totalTaps = d.totalTaps; }catch(e){} } if(this.usersDbFile && fs.existsSync(this.usersDbFile)) { try { this.userTracker = JSON.parse(fs.readFileSync(this.usersDbFile)); } catch(e) { this.userTracker = {}; } } this.recalculateTapProgress(); }
    startNewSession() { if (this.saveTimeout) clearTimeout(this.saveTimeout); if(this.sessionFile && fs.existsSync(this.sessionFile)) try{ fs.unlinkSync(this.sessionFile); }catch(e){} if(this.usersDbFile && fs.existsSync(this.usersDbFile)) try{ fs.unlinkSync(this.usersDbFile); }catch(e){} this.state.stats = {totalDiamonds:0, totalShares:0}; this.state.totalTaps = 0; this.userTracker = {}; this.emitAllStats(); this._writeSessionToDisk(); this.logger("[SISTEMA] === NUEVA TRANSMISIÓN INICIADA (Todo Limpio) ==="); }
    testGlobalGift(points) { if(!this.isLicensed)return; this.state.stats.totalDiamonds += parseInt(points); this.checkPointGoal(); this.emitModule1(); this.emitPanelStats(); this.saveSession(); }
    testTaps(amount) { if(!this.isLicensed)return; this.state.totalTaps += parseInt(amount); this.checkTapGoal(); this.emitModule2(); this.emitPanelStats(); this.saveSession(); }
    testShare(amount) { if(!this.isLicensed)return; this.state.stats.totalShares += parseInt(amount); this.emitPanelStats(); this.saveSession(); }
    testBattleGift(teamId, points) { if(!this.isLicensed)return; points = parseInt(points); if(!this.state.streamScores[teamId])this.state.streamScores[teamId]=0; this.state.streamScores[teamId]+=points; this.broadcast({type:'stream_scores',data:this.state.streamScores}); this.state.stats.totalDiamonds+=points; this.checkPointGoal(); this.emitModule1(); this.emitPanelStats(); this.saveSession(); }
    recalculateTapProgress() { this.checkTapGoal(); }
}

module.exports = { TikFinityClient };