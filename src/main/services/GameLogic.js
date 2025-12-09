// src/main/services/GameLogic.js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { logEvent } = require('./ApiLogger');

class GameLogic {
    constructor(broadcastCallback, stateManager) {
        this.broadcast = broadcastCallback;
        this.state = stateManager;

        // Inicializar Estado
        this.state.totalTaps = 0;
        this.state.stats = { totalDiamonds: 0, totalShares: 0 };

        // Variables internas de control
        this.userTracker = {};
        this.currentTapGoalIndex = 0;
        this.currentPointGoalIndex = 0;
        this.tapGoalJustMet = false;
        this.pointGoalJustMet = false;

        this.saveTimeout = null;

        // Rutas de archivos
        try {
            const userDataPath = app.getPath('userData');
            this.sessionFile = path.join(userDataPath, 'session_stats.json');
            this.usersDbFile = path.join(userDataPath, 'session_users.json');
        } catch (e) { console.error(e); }

        this.loadSession();
    }

    // --- PROCESAMIENTO PRINCIPAL ---
    processEvent(eventType, payload) {
        let sessionChanged = false;

        // 1. LIKES (TAPS)
        if (eventType.includes('like')) {
            const serverTotal = parseInt(payload.totalLikeCount || payload.totalLikes || -1);
            const batchLikes = parseInt(payload.likeCount || payload.likes || payload.count || 0);

            if (!isNaN(serverTotal) && serverTotal > this.state.totalTaps) {
                this.state.totalTaps = serverTotal;
                sessionChanged = true;
            } else if (batchLikes > 0) {
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
        // 2. SHARES
        else if (eventType.includes('share')) {
            const amount = parseInt(payload.amount || 1);
            this.state.stats.totalShares += amount;
            this.emitPanelStats();
            this.saveSession();
        }
        // 3. GIFTS
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
                    // Sumar al Stream Total
                    if (!this.state.streamScores[teamId]) this.state.streamScores[teamId] = 0;
                    this.state.streamScores[teamId] += points;

                    // Sumar a la Batalla (Si aplica)
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

        // Loguear para análisis
        logEvent(eventType, payload);
    }

    // --- FUNCIONES DE CÁLCULO ---
    findTeamIdByGift(giftName) {
        if(!giftName) return null;
        const incoming = giftName.toLowerCase().trim();
        const teams = this.state.config.teams || [];

        const team = teams.find(t => {
            if (t.giftName && t.giftName.toLowerCase().trim() === incoming) return true;
            if (t.giftName_low && t.giftName_low.toLowerCase().trim() === incoming) return true;
            if (t.giftName_mid && t.giftName_mid.toLowerCase().trim() === incoming) return true;
            if (t.giftName_high && t.giftName_high.toLowerCase().trim() === incoming) return true;
            return false;
        });
        return team ? team.id : null;
    }

    // --- EMISORES DE ESTADO VISUAL ---
    emitAllStats() { this.emitModule1(); this.emitModule2(); this.emitPanelStats(); }

    emitModule1() { // Puntos / Estrella
        const state = this.calculateTotalPointsState();
        this.broadcast({ type: 'TOTAL_POINTS_UPDATE', data: state });
        this.pointGoalJustMet = false;
    }
    emitModule2() { // Taps / Corazón
        const state = this.calculateTapState();
        this.broadcast({ type: 'TAPS_UPDATE', data: state });
        this.tapGoalJustMet = false;
    }
    emitPanelStats() { // React Panel
        this.broadcast({ type: 'STATS_UPDATE', data: { taps: this.state.totalTaps, diamonds: this.state.stats.totalDiamonds, shares: this.state.stats.totalShares } });
    }

    // --- CÁLCULOS DE METAS (Lógica pura) ---
    checkTapGoal() {
        const goals = this.state.config.layout?.tap_goals || [];
        if (!goals.length) return;
        let newIndex = 0;
        for (let i = 0; i < goals.length; i++) {
            if (this.state.totalTaps >= parseInt(goals[i].taps)) newIndex = i + 1; else { newIndex = i; break; }
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

    // --- PERSISTENCIA ---
    saveSession() { if (this.saveTimeout) clearTimeout(this.saveTimeout); this.saveTimeout = setTimeout(() => { this._writeSessionToDisk(); }, 3000); }
    _writeSessionToDisk() { if(this.sessionFile) try{ fs.writeFileSync(this.sessionFile, JSON.stringify({ stats: this.state.stats, totalTaps: this.state.totalTaps })); }catch(e){} if(this.usersDbFile) try { fs.writeFileSync(this.usersDbFile, JSON.stringify(this.userTracker)); } catch(e){} }
    loadSession() { if(this.sessionFile && fs.existsSync(this.sessionFile)){ try{ const d = JSON.parse(fs.readFileSync(this.sessionFile)); if(d.stats) this.state.stats = d.stats; if(d.totalTaps) this.state.totalTaps = d.totalTaps; }catch(e){} } if(this.usersDbFile && fs.existsSync(this.usersDbFile)) { try { this.userTracker = JSON.parse(fs.readFileSync(this.usersDbFile)); } catch(e) { this.userTracker = {}; } } this.recalculateTapProgress(); }
    startNewSession() { if (this.saveTimeout) clearTimeout(this.saveTimeout); if(this.sessionFile && fs.existsSync(this.sessionFile)) try{ fs.unlinkSync(this.sessionFile); }catch(e){} if(this.usersDbFile && fs.existsSync(this.usersDbFile)) try{ fs.unlinkSync(this.usersDbFile); }catch(e){} this.state.stats = {totalDiamonds:0, totalShares:0}; this.state.totalTaps = 0; this.userTracker = {}; this.emitAllStats(); this._writeSessionToDisk(); console.log("[GAME] Sesión Reiniciada."); }
    recalculateTapProgress() { this.checkTapGoal(); }
}

module.exports = GameLogic;