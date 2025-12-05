import { useState, useEffect } from 'react';
import CHANNELS from '../../shared/channels';

const getIpc = () => {
    if (window.electron && window.electron.ipcRenderer) return window.electron.ipcRenderer;
    return { send: () => {}, on: () => {}, removeAllListeners: () => {} };
};

export const useBattleSystem = () => {
    const [timer, setTimer] = useState(0);
    const [isBattleActive, setIsBattleActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Estado para el color del botón

    const ipcRenderer = getIpc();

    useEffect(() => {
        const onTimerUpdate = (event, data) => {
            let seconds = 0;
            // Detectar si viene el objeto completo del backend
            if (typeof data === 'object') {
                seconds = data.seconds || 0;
                setIsBattleActive(data.running);
                setIsPaused(data.paused === true); // Actualizar estado de pausa
            } else {
                seconds = data;
            }
            setTimer(seconds);
        };

        ipcRenderer.on(CHANNELS.BATTLE.UPDATE_TIMER, onTimerUpdate);

        return () => {
            ipcRenderer.removeAllListeners(CHANNELS.BATTLE.UPDATE_TIMER);
        };
    }, []);

    // --- FUNCIONES ---

    const startBattle = (minutes, seconds) => {
        const total = (parseInt(minutes || 0) * 60) + parseInt(seconds || 0);
        if (total > 0) ipcRenderer.send(CHANNELS.BATTLE.START, total);
    };

    const stopBattle = () => ipcRenderer.send(CHANNELS.BATTLE.STOP);
    const pauseBattle = () => ipcRenderer.send(CHANNELS.BATTLE.PAUSE);

    const resetScores = (type) => {
        switch (type) {
            case 'battle': ipcRenderer.send(CHANNELS.BATTLE.RESET_SCORES); break;
            case 'stream': ipcRenderer.send(CHANNELS.BATTLE.RESET_STREAM); break;
            case 'taps':   ipcRenderer.send(CHANNELS.BATTLE.RESET_TAPS); break;
            case 'points': ipcRenderer.send(CHANNELS.BATTLE.RESET_POINTS); break;
        }
    };

    return { timer, isBattleActive, isPaused, startBattle, stopBattle, pauseBattle, resetScores };
};