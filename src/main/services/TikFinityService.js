const WebSocket = require('ws');

class TikFinityClient {
    constructor(broadcastCallback, state) {
        this.broadcast = broadcastCallback; // Función para hablar con OBS
        this.state = state; // Estado global compartido con server.js
        this.ws = null;
        this.reconnectInterval = 5000;
    }

    updateConfig(config) {
        // Si cambia la URL, reconectamos
        const oldUrl = this.state.config.tikfinity_ws_url;
        this.state.config = config;

        if (config.tikfinity_ws_url && config.tikfinity_ws_url !== oldUrl) {
            this.connect();
        }
    }

    connect() {
        const url = this.state.config.tikfinity_ws_url || "ws://localhost:21213/";

        if (this.ws) {
            try { this.ws.close(); } catch(e){}
        }

        console.log(`[TIK] Conectando a ${url}...`);
        this.ws = new WebSocket(url);

        this.ws.on('open', () => console.log('[TIK] Conectado'));

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.processMessage(msg);
            } catch (e) {
                console.error('[TIK] Error parsing JSON:', e);
            }
        });

        this.ws.on('close', () => {
            console.log('[TIK] Desconectado. Reintentando...');
            setTimeout(() => this.connect(), this.reconnectInterval);
        });

        this.ws.on('error', (err) => console.error('[TIK] Error:', err.message));
    }

    processMessage(msg) {
        // 1. LIKES (TAPS)
        if (msg.event === 'like') {
            const count = msg.data.likeCount || 0;
            if (count > 0) {
                this.state.totalTaps += count;
                // Enviamos actualización al overlay de Corazón
                this.broadcast({
                    type: 'TAPS_UPDATE',
                    data: this.calculateTapState()
                });
            }
        }
        // 2. GIFTS (PUNTOS)
        else if (msg.event === 'gift') {
            const data = msg.data;
            if (data.giftType === 1 && !data.repeatEnd) return; // Ignorar combo intermedio

            const giftName = (data.giftName || '').toLowerCase().trim();
            const points = (data.diamondCount || 0) * (data.repeatCount || 1);
            const teamId = this.findTeamIdByGift(giftName);

            if (teamId) {
                // A. Sumar a Tabla Total (Siempre)
                if (!this.state.streamScores[teamId]) this.state.streamScores[teamId] = 0;
                this.state.streamScores[teamId] += points;

                // B. Sumar a Batalla (Solo si el timer corre)
                if (this.state.timer.running) {
                    if (!this.state.scores[teamId]) this.state.scores[teamId] = 0;
                    this.state.scores[teamId] += points;
                    // Actualizar Barra VS
                    this.broadcast({ type: 'scores', data: this.state.scores });
                }

                // Actualizar Tabla y Estrella
                this.broadcast({ type: 'stream_scores', data: this.state.streamScores });
                this.broadcast({
                    type: 'TOTAL_POINTS_UPDATE',
                    data: this.calculateTotalPointsState()
                });

                console.log(`[GIFT] +${points} para ${teamId}`);
            }
        }
    }

    findTeamIdByGift(giftName) {
        const teams = this.state.config.teams || [];
        const team = teams.find(t => t.giftName && t.giftName.toLowerCase().trim() === giftName);
        return team ? team.id : null;
    }

    // Helpers para calcular porcentajes (Lógica portada de Python)
    calculateTapState() {
        // Aquí iría la lógica de metas de taps (array tap_goals de config)
        // Simplificado para el ejemplo:
        return {
            currentTaps: this.state.totalTaps,
            currentGoalTaps: 10000, // Debería venir de config
            percent: Math.min((this.state.totalTaps / 10000) * 100, 100),
            goalJustMet: false
        };
    }

    calculateTotalPointsState() {
        const total = Object.values(this.state.streamScores).reduce((a, b) => a + b, 0);
        return {
            currentPoints: total,
            currentGoalPoints: 50000, // Debería venir de config
            percent: Math.min((total / 50000) * 100, 100),
            goalJustMet: false
        };
    }
}

module.exports = { TikFinityClient };