const { EventEmitter } = require('events');

class BattleService extends EventEmitter {
    constructor(sharedState) {
        super();
        this.state = sharedState;
        // Inicialización segura
        if (!this.state.scores) this.state.scores = {};
        if (!this.state.streamScores) this.state.streamScores = {};
        if (!this.state.totalTaps) this.state.totalTaps = 0;
        if (!this.state.timer) this.state.timer = { running: false, seconds: 0, endsAt: 0, paused: false };
        this.interval = null;
    }

    addPoints(teamId, amount) {
        if (!teamId) return;
        // Total Stream (Siempre suma)
        if (!this.state.streamScores[teamId]) this.state.streamScores[teamId] = 0;
        this.state.streamScores[teamId] += amount;

        // Batalla (Suma según configuración)
        // Si el timer corre O si está permitido sumar sin timer (nueva opción)
        const allowOffTimer = this.state.config?.allow_gifts_off_timer;

        if (this.state.timer.running || allowOffTimer) {
            if (!this.state.scores[teamId]) this.state.scores[teamId] = 0;
            this.state.scores[teamId] += amount;
        }

        this.emitChange();
    }

    addTaps(amount) {
        this.state.totalTaps += amount;
        this.emitChange();
    }

    // --- NUEVO: SUMAR/RESTAR TIEMPO ---
    addTime(seconds) {
        if (!this.state.timer.running && !this.state.timer.paused) return;

        // Si está corriendo, ajustamos el tiempo final
        if (this.state.timer.running) {
            this.state.timer.endsAt += seconds;
            // Actualizar visualmente de inmediato
            const now = Date.now() / 1000;
            this.state.timer.seconds = Math.max(0, this.state.timer.endsAt - now);
        }
        // Si está pausado, ajustamos el tiempo restante guardado
        else if (this.state.timer.paused) {
            this.state.timer.remainingOnPause += seconds;
            this.state.timer.seconds = Math.max(0, this.state.timer.remainingOnPause);
        }

        this.emit('timer-update', this.state.timer);
        this.emitChange();
    }

    startBattle(seconds) {
        this.stopLoop();

        // Resetear puntuaciones de batalla
        this.state.scores = {};
        if(this.state.config && this.state.config.teams) {
            this.state.config.teams.forEach(t => this.state.scores[t.id] = 0);
        }

        const now = Date.now() / 1000;
        this.state.timer = {
            running: true,
            seconds: seconds,
            endsAt: now + seconds,
            paused: false,
            remainingOnPause: 0
        };

        this.startLoop();
        this.emit('battle-start');
        this.emitChange();
        this.emit('timer-update', this.state.timer);

        // Doble check para asegurar ceros
        setTimeout(() => this.emitChange(), 100);
    }

    stopBattle() {
        this.state.timer.running = false;
        this.state.timer.paused = false;
        this.state.timer.seconds = 0;
        this.stopLoop();
        this.emitChange();
        this.emit('battle-end');
        this.emit('timer-update', this.state.timer);
    }

    togglePause() {
        const now = Date.now() / 1000;
        if (this.state.timer.running) {
            this.state.timer.running = false;
            this.state.timer.paused = true;
            this.state.timer.remainingOnPause = this.state.timer.endsAt - now;
            this.state.timer.seconds = this.state.timer.remainingOnPause;
        } else if (this.state.timer.paused) {
            this.state.timer.running = true;
            this.state.timer.paused = false;
            this.state.timer.endsAt = now + this.state.timer.remainingOnPause;
            this.startLoop();
        }
        this.emitChange();
        this.emit('timer-update', this.state.timer);
    }

    resetScores(type) {
        if (type === 'battle') {
            this.state.scores = {};
            this.emit('battle-start'); // Limpia ganador
        }
        if (type === 'stream') this.state.streamScores = {};
        if (type === 'taps') this.state.totalTaps = 0;
        this.emitChange();
    }

    startLoop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
            if (!this.state.timer.running) return;
            const now = Date.now() / 1000;
            const remaining = Math.max(0, this.state.timer.endsAt - now);
            this.state.timer.seconds = remaining;
            this.emit('timer-update', this.state.timer);
            if (remaining <= 0) {
                this.stopBattle();
            }
        }, 500);
    }

    stopLoop() {
        if (this.interval) clearInterval(this.interval);
    }

    emitChange() {
        this.emit('update', this.state);
    }
}

module.exports = BattleService;