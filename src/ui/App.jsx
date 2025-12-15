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

    // --- ESTADO PARA LA VERSIÓN ---
    const [appVersion, setAppVersion] = useState('Loading...');

    // --- GESTOR DE MODALES GLOBAL ---
    const [globalModal, setGlobalModal] = useState({
        show: false,
        type: 'info', // info, success, warning, update
        title: '',
        message: '',
        onConfirm: null,
        onCancel: null,
        confirmText: 'Aceptar',
        cancelText: 'Cancelar',
        showCancel: true
    });

    // Estado global de datos (Sync entre pestañas)
    const [globalStats, setGlobalStats] = useState({ taps: 0, diamonds: 0, shares: 0 });

    const ipcRenderer = getIpc();

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3000);
    };

    // --- FUNCIONES PARA MOSTRAR MODALES ---
    const closeModal = () => setGlobalModal({ ...globalModal, show: false });

    const showModal = (options) => {
        setGlobalModal({
            show: true,
            type: options.type || 'info',
            title: options.title || 'Mensaje',
            message: options.message || '',
            onConfirm: options.onConfirm || closeModal,
            onCancel: options.onCancel || closeModal,
            confirmText: options.confirmText || 'Aceptar',
            cancelText: options.cancelText || 'Cancelar',
            showCancel: options.showCancel !== undefined ? options.showCancel : true
        });
    };

    // --- LÓGICA DE SESIÓN ---
    const handleNewSession = () => {
        ipcRenderer.send(CHANNELS.BATTLE.RESET_SESSION);
        addToast('Nueva sesión iniciada: Contadores a 0', 'success');
        setGlobalStats({ taps: 0, diamonds: 0, shares: 0 });
        closeModal();
        sessionStorage.setItem('sessionModalShown', 'true');
    };

    const handleContinueSession = () => {
        addToast('Continuando sesión anterior', 'info');
        closeModal();
        sessionStorage.setItem('sessionModalShown', 'true');
    };

    useEffect(() => {
        // 1. LICENCIA
        const onLicense = (e, isValid) => {
            setIsLicensed(isValid);
            const alreadyShown = sessionStorage.getItem('sessionModalShown');
            if (isValid === true && !alreadyShown) {
                // MODAL INICIO SESIÓN (ESTILO NUEVO)
                showModal({
                    type: 'info',
                    title: '🚀 ¿Iniciar Nueva Transmisión?',
                    message: 'Puedes reiniciar todos los contadores a cero o continuar con los acumulados de la sesión anterior.',
                    confirmText: '🗑️ Nueva Sesión',
                    cancelText: '↩️ Continuar',
                    onConfirm: handleNewSession,
                    onCancel: handleContinueSession
                });
            }
        };

        // 2. VERSIÓN DE LA APP
        const onAppVersion = (e, version) => { setAppVersion(version); };

        // 3. ESTADO COMPLETO Y ACTUALIZACIONES
        const onFullState = (e, fullState) => {
            if (fullState) {
                setConnectionStatus(fullState.status);
                if (fullState.stats) setGlobalStats(fullState.stats);
            }
        };

        const onStatsUpdate = (e, msg) => {
            if (msg.type === 'APP_STATUS') {
                setConnectionStatus(msg.data.status);
                return;
            }
            const payload = msg.data || msg;
            if (msg.type === 'STATS_UPDATE' || msg.type === 'TAPS_UPDATE' || msg.type === 'TOTAL_POINTS_UPDATE') {
                setGlobalStats(prev => ({
                    taps: payload.taps !== undefined ? payload.taps : prev.taps,
                    diamonds: payload.diamonds !== undefined ? payload.diamonds : prev.diamonds,
                    shares: payload.shares !== undefined ? payload.shares : prev.shares
                }));
                setConnectionStatus('active');
            }
        };

        const onConfigUpdated = () => { addToast('Configuración Guardada', 'success'); };

        // --- 4. SISTEMA DE ACTUALIZACIONES (AHORA CON MODALES PROPIOS) ---

        // A) Update Disponible
        const onUpdateAvailable = (event, version) => {
            showModal({
                type: 'update',
                title: '⬇️ Actualización Disponible',
                message: `La versión ${version} está lista para descargar. Trae mejoras de rendimiento y nuevos features.`,
                confirmText: '📥 Descargar e Instalar',
                cancelText: 'Ignorar',
                onConfirm: () => {
                    ipcRenderer.send('start-download');
                    closeModal();
                    addToast('Descargando actualización en segundo plano...', 'info');
                }
            });
        };

        // B) Progreso
        const onDownloadProgress = (event, progressObj) => {
            const p = Math.floor(progressObj.percent);
            if(p % 20 === 0 && p > 0) console.log(`Descargando update: ${p}%`);
        };

        // C) Descarga Lista -> INSTALAR
        const onUpdateDownloaded = () => {
            showModal({
                type: 'success',
                title: '🚀 Instalación Lista',
                message: 'La actualización se ha descargado correctamente. La aplicación necesita reiniciarse para aplicar los cambios.',
                confirmText: '🔄 Reiniciar Ahora',
                cancelText: 'Más tarde',
                onConfirm: () => {
                    ipcRenderer.send('install-update');
                }
            });
        };

        // SUSCRIPCIONES
        ipcRenderer.on('license-status', onLicense);
        ipcRenderer.on('app-version', onAppVersion);
        ipcRenderer.on('full-state-data', onFullState);
        ipcRenderer.on('stats-update', onStatsUpdate);
        ipcRenderer.on('config:updated', onConfigUpdated);

        // Listeners del Update
        ipcRenderer.on('update_available', onUpdateAvailable);
        ipcRenderer.on('download-progress', onDownloadProgress);
        ipcRenderer.on('update_downloaded', onUpdateDownloaded);

        // LLAMADAS INICIALES
        ipcRenderer.send('request-config');
        setTimeout(() => ipcRenderer.send('request-full-state'), 500);

        return () => {
            ipcRenderer.removeAllListeners('license-status');
            ipcRenderer.removeAllListeners('app-version');
            ipcRenderer.removeAllListeners('full-state-data');
            ipcRenderer.removeAllListeners('stats-update');
            ipcRenderer.removeAllListeners('config:updated');
            ipcRenderer.removeAllListeners('update_available');
            ipcRenderer.removeAllListeners('download-progress');
            ipcRenderer.removeAllListeners('update_downloaded');
        };
    }, []);

    // --- RENDER UI ---
    const getStatusUI = () => {
        switch(connectionStatus) {
            case 'active': return { label: 'ONLINE', color: 'status-connected' };
            case 'waiting': return { label: 'EN ESPERA (SIN DATOS)', color: 'status-connecting' };
            case 'connecting': return { label: 'CONECTANDO...', color: 'status-connecting' };
            case 'disconnected': return { label: 'OFFLINE OPEN TIKFINITY', color: 'status-disconnected' };
            default: return { label: 'OFFLINE', color: 'status-disconnected' };
        }
    };
    const statusUI = getStatusUI();

    if (isLicensed === null) return ( <div className="app-background"><div className="glass-container">Cargando...</div></div> );
    if (isLicensed === false) return ( <div className="app-background"><LicenseModal onLoginSuccess={() => { setIsLicensed(true); if(!sessionStorage.getItem('sessionModalShown')) handleNewSession(); }} /></div> );

    return (
        <div className="app-background">
            <div className="ambient-orb orb-1"></div>
            <div className="ambient-orb orb-2"></div>

            {/* --- COMPONENTE VISUAL DEL MODAL GLOBAL --- */}
            {globalModal.show && (
                <div className="custom-modal-overlay">
                    <div className="custom-modal-box">
                        <span className="modal-icon">
                            {globalModal.type === 'update' ? '⬇️' :
                                globalModal.type === 'success' ? '✅' :
                                    globalModal.type === 'warning' ? '⚠️' : 'ℹ️'}
                        </span>
                        <div className="modal-title">{globalModal.title}</div>
                        <div className="modal-message">{globalModal.message}</div>
                        <div className="modal-buttons">
                            {globalModal.showCancel && (
                                <button className="btn-modal btn-cancel" onClick={globalModal.onCancel}>
                                    {globalModal.cancelText}
                                </button>
                            )}
                            <button className="btn-modal btn-confirm" onClick={globalModal.onConfirm}>
                                {globalModal.confirmText}
                            </button>
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