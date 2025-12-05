const { setupServer } = require('./server');
const { TikFinityClient } = require('./tikfinity');
const BattleService = require('./services/BattleService');
const GiftService = require('./services/GiftService');
const ConfigService = require('./services/ConfigService');

function initializeServices(mainWindow) {
    const logToUI = (msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log', msg);
        }
        console.log(msg);
    };

    const server = setupServer(mainWindow);
    const giftService = new GiftService();
    const battleService = new BattleService(server.state);

    const broadcastDual = (msgObj) => {
        // A. Enviar a OBS (Overlay)
        server.broadcast(msgObj);

        // B. Enviar al Panel de Control (React)
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Stats Generales Y STATUS DE LA APP
            // ¡AGREGADO APP_STATUS!
            if (msgObj.type === 'STATS_UPDATE' || msgObj.type === 'TAPS_UPDATE' || msgObj.type === 'TOTAL_POINTS_UPDATE' || msgObj.type === 'APP_STATUS') {
                mainWindow.webContents.send('stats-update', msgObj);
            }

            if (msgObj.type === 'scores') mainWindow.webContents.send('battle:update-scores', msgObj.data);
            if (msgObj.type === 'stream_scores') mainWindow.webContents.send('battle:update-stream-scores', msgObj.data);
            if (msgObj.type === 'BATTLE_END') mainWindow.webContents.send('battle:end', msgObj.data);
            if (msgObj.type === 'BATTLE_START') mainWindow.webContents.send('battle:start', msgObj.data);
        }
    };

    const tikClient = new TikFinityClient(
        broadcastDual,
        server.state,
        logToUI
    );

    const currentConfig = ConfigService.get();
    server.state.config = currentConfig;
    tikClient.updateConfig(currentConfig);

    battleService.on('update', (state) => {
        server.broadcast({ type: 'scores', data: state.scores });
        server.broadcast({ type: 'stream_scores', data: state.streamScores });
        if(mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('battle:update-scores', state.scores);
            mainWindow.webContents.send('battle:update-stream-scores', state.streamScores);
        }
    });

    battleService.on('timer-update', (data) => {
        if(mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('battle:update-timer', data);
        }
        server.broadcast({ type: 'TIMER_UPDATE', data: data });
    });

    battleService.on('battle-start', () => {
        const msg = { type: 'BATTLE_START', data: {} };
        server.broadcast(msg);
        if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('battle:start', {});
    });

    battleService.on('battle-end', () => {
        let winner = null;
        let maxScore = -1;
        Object.entries(server.state.scores).forEach(([id, score]) => {
            if(score > maxScore) { maxScore = score; winner = id; }
        });
        const team = server.state.config.teams.find(t => t.id === winner);
        const data = (team && maxScore > 0)
            ? { winner: { name: team.name, color: team.color, icon: team.icon } }
            : { winner: null };
        server.broadcast({ type: 'BATTLE_END', data: data });
        if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('battle:end', data);
    });

    return { server, tikClient, battleService, giftService };
}

module.exports = { initializeServices };