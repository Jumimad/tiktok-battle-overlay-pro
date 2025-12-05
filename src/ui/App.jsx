import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import BattleTab from './components/BattleTab';
import ConfigTab from './components/ConfigTab';
import TestTab from './components/TestTab';
import OverlaysTab from './components/OverlaysTab';
import LicenseModal from './components/LicenseModal';
import ToastContainer from './components/ToastNotification';
import CHANNELS from '../shared/channels';

const getIpc = () => {
    if (window.electron && window.electron.ipcRenderer) return window.electron.ipcRenderer;
    return { on: () => {}, removeAllListeners: () => {}, send: () => {}, invoke: async () => ({ success: false }) };
};

function App() {

    const [activeTab, setActiveTab] = useState('battle');
    const [isLicensed, setIsLicensed] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [toasts, setToasts] = useState([]);
    const [showSessionModal, setShowSessionModal] = useState(false);
    const [appVersion, setAppVersion] = useState('Loading...');

    // --- NUEVO: ESTADO PARA ACTUALIZACIONES ---
    const [updateInfo, setUpdateInfo] = useState(null);

    // Estado global de datos (Sync entre pestañas)
    const [globalStats, setGlobalStats] = useState({ taps: 0, diamonds: 0, shares: 0 });

    const hasShownSessionModal = useRef(false);
    const ipcRenderer = getIpc();

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3000);
    };

    const handleNewSession = () => {
        ipcRenderer.send(CHANNELS.BATTLE.RESET_SESSION);
        addToast('Nueva sesión iniciada: Contadores a 0', 'success');
        setGlobalStats({ taps: 0, diamonds: 0, shares: 0 });
        setShowSessionModal(false);
        sessionStorage.setItem('sessionModalShown', 'true');
    };

    const handleContinueSession = () => {
        addToast('Continuando sesión anterior', 'info');
        setShowSessionModal(false);
        sessionStorage.setItem('sessionModalShown', 'true');
    };

    useEffect(() => {
        // 1. LICENCIA
        const onLicense = (e, isValid) => {
            setIsLicensed(isValid);
            const alreadyShown = sessionStorage.getItem('sessionModalShown');
            if (isValid === true && !alreadyShown) {
                setShowSessionModal(true);
            }
        };

        const onAppVersion = (e, version) => {
            setAppVersion(version); // Guardamos la versión que nos dio el backend
        };

        // 2. ESTADO COMPLETO (Al iniciar)
        const onFullState = (e, fullState) => {
            if (fullState) {
                setConnectionStatus(fullState.status);
                if (fullState.stats) setGlobalStats(fullState.stats);
            }
        };

        // 3. ACTUALIZACIÓN EN TIEMPO REAL
        const onStatsUpdate = (e, msg) => {
            // Mensaje de ESTADO
            if (msg.type === 'APP_STATUS') {
                setConnectionStatus(msg.data.status);
                return;
            }

            // Mensaje de DATOS
            const payload = msg.data || msg;
            if (msg.type === 'STATS_UPDATE' || msg.type === 'TAPS_UPDATE' || msg.type === 'TOTAL_POINTS_UPDATE') {
                setGlobalStats(prev => ({
                    taps: payload.taps !== undefined ? payload.taps : prev.taps,
                    diamonds: payload.diamonds !== undefined ? payload.diamonds : prev.diamonds,
                    shares: payload.shares !== undefined ? payload.shares : prev.shares
                }));
                // Auto-corrección visual a VERDE si entran datos
                setConnectionStatus('active');
            }
        };

        const onConfigUpdated = () => { addToast('Configuración Guardada', 'success'); };

        // --- 4. NUEVO: LISTENERS DE ACTUALIZACIÓN ---
        const onUpdateAvailable = (event, version) => {
            setUpdateInfo(version); // Guardamos la versión para mostrar el modal
        };

        const onUpdateDownloaded = () => {
            // Cuando termina de bajar, preguntamos si reiniciar
            if(window.confirm("¡Actualización descargada! ¿Reiniciar ahora para instalar?")) {
                ipcRenderer.send('install-update');
            }
        };

        // SUSCRIPCIONES
        ipcRenderer.on('license-status', onLicense);
        ipcRenderer.on('app-version', onAppVersion);
        ipcRenderer.on('full-state-data', onFullState);
        ipcRenderer.on('stats-update', onStatsUpdate);
        ipcRenderer.on('config:updated', onConfigUpdated);

        // Listeners del Update
        ipcRenderer.on('update_available', onUpdateAvailable);
        ipcRenderer.on('update_downloaded', onUpdateDownloaded);

        // LLAMADAS INICIALES
        ipcRenderer.send('request-config');
        setTimeout(() => ipcRenderer.send('request-full-state'), 500);

        return () => {
            ipcRenderer.removeAllListeners('license-status');
            ipcRenderer.removeAllListeners('full-state-data');
            ipcRenderer.removeAllListeners('stats-update');
            ipcRenderer.removeAllListeners('config:updated');
            ipcRenderer.removeAllListeners('update_available');
            ipcRenderer.removeAllListeners('update_downloaded');
            ipcRenderer.removeAllListeners('app-version')
        };
    }, []);

    // --- RENDER DEL BOTÓN INTELIGENTE ---
    const getStatusUI = () => {
        switch(connectionStatus) {
            case 'active': return { label: 'ONLINE', color: 'status-connected' }; // Verde
            case 'waiting': return { label: 'EN ESPERA (SIN DATOS)', color: 'status-connecting' }; // Naranja
            case 'connecting': return { label: 'CONECTANDO...', color: 'status-connecting' }; // Naranja parpadeando
            case 'disconnected': return { label: 'OFFLINE OPEN TIKFINITY', color: 'status-disconnected' }; // Rojo
            default: return { label: 'OFFLINE', color: 'status-disconnected' };
        }
    };

    const statusUI = getStatusUI();

    if (isLicensed === null) return ( <div className="app-background"><div className="glass-container">Cargando...</div></div> );
    if (isLicensed === false) return ( <div className="app-background"><LicenseModal onLoginSuccess={() => { setIsLicensed(true); if(!sessionStorage.getItem('sessionModalShown')) setShowSessionModal(true); }} /></div> );

    return (
        <div className="app-background">
            <div className="ambient-orb orb-1"></div>
            <div className="ambient-orb orb-2"></div>

            {/* --- NUEVO: MODAL DE ACTUALIZACIÓN --- */}
            {updateInfo && (
                <div className="license-overlay" style={{zIndex: 100000}}>
                    <div className="license-box" style={{border: '2px solid #00CCFF'}}>
                        <div style={{fontSize: 40, marginBottom: 10}}>⬇️</div>
                        <h2>¡Actualización Disponible!</h2>
                        <p>La versión <b>{updateInfo}</b> está lista para descargar.</p>
                        <p style={{fontSize: 12, opacity: 0.7}}>Mejoras de rendimiento y nuevos features.</p>

                        <div style={{display:'flex', gap:10, marginTop: 20}}>
                            <button className="btn btn-primary" style={{flex:1, padding: 15}} onClick={() => {
                                ipcRenderer.send('start-download');
                                setUpdateInfo(null); // Ocultar mientras baja
                                addToast('Descargando en segundo plano...', 'info');
                            }}>
                                📥 Descargar e Instalar
                            </button>
                            <button className="btn btn-dark" style={{flex:1, padding: 15}} onClick={() => setUpdateInfo(null)}>
                                Ignorar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE SESIÓN */}
            {showSessionModal && (
                <div className="license-overlay" style={{zIndex: 99999}}>
                    <div className="license-box" style={{width: 500, border: '1px solid var(--neon-blue)'}}>
                        <div style={{fontSize: 50, marginBottom: 10}}>🚀</div>
                        <h2>¿Iniciar Nueva Transmisión?</h2>
                        <p>Puedes reiniciar todos los contadores a cero o continuar con los acumulados de la sesión anterior.</p>
                        <div style={{display:'flex', gap: 15, marginTop: 30}}>
                            <button className="btn btn-info" style={{flex:1, padding: 15}} onClick={handleContinueSession}>↩️ Continuar</button>
                            <button className="btn btn-danger" style={{flex:1, padding: 15}} onClick={handleNewSession}>🗑️ Nueva</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-container">
                <div className="tabs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 }}>
                    <div className="tabs-pill-container">
                        <button className={activeTab === 'battle' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('battle')}>⚔️ Batalla</button>
                        <button className={activeTab === 'overlays' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('overlays')}>📺 All Overlays</button>
                        <button className={activeTab === 'config' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('config')}>⚙️ Config</button>
                        <button className={activeTab === 'test' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('test')}>🧪 Pruebas</button>
                    </div>

                    <div className="status-indicator">
                        <div className={`status-dot ${statusUI.color}`}></div>
                        <span>{statusUI.label}</span>
                    </div>
                </div>

                <div className="content-scroll-area">
                    <div className="content-wrapper">
                        {activeTab === 'battle' && <BattleTab globalStats={globalStats} onShowToast={addToast} />}
                        {activeTab === 'overlays' && <OverlaysTab />}
                        {activeTab === 'config' && <ConfigTab onShowToast={addToast} />}
                        {activeTab === 'test' && <TestTab />}
                    </div>
                    <div className="footer">✨ TikBattle OS v{appVersion} - Licencia Activa ✅ - by jinchu</div>
                </div>
            </div>
            <ToastContainer toasts={toasts} />
        </div>
    );
}

export default App;