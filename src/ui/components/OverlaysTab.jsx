import React, { useState, useEffect } from 'react';
import CHANNELS from '../../shared/channels';

const getIpc = () => {
    if (window.electron && window.electron.ipcRenderer) return window.electron.ipcRenderer;
    return { send: () => {}, on: () => {}, removeAllListeners: () => {} };
};

const OverlaysTab = () => {
    const [port, setPort] = useState(8080);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const ipcRenderer = getIpc();

    // Lista de tus overlays (Basado en los archivos de tu carpeta public)
    const overlays = [
        {
            title: "Overlay Principal",
            desc: "Batalla, Timer y Barras",
            file: "overlay.html",
            icon: "⚔️",
            color: "#FF00FF"
        },
        {
            title: "Tabla de Posiciones",
            desc: "Ranking Vertical de Equipos",
            file: "tabla.html",
            icon: "🏆",
            color: "#00CCFF"
        },
        {
            title: "Corazón de Taps",
            desc: "Animación de Likes acumulados",
            file: "taptaps.html",
            icon: "❤️",
            color: "#FF453A"
        },
        {
            title: "Meta Estrella",
            desc: "Objetivo Global de Diamantes",
            file: "metatotal.html",
            icon: "⭐",
            color: "#FFD700"
        }
    ];

    useEffect(() => {
        const onConfig = (e, config) => {
            if (config && config.server_port) {
                setPort(config.server_port);
            }
        };
        ipcRenderer.on('config-loaded', onConfig);
        ipcRenderer.send('request-config');
        return () => ipcRenderer.removeAllListeners('config-loaded');
    }, []);

    const generateUrl = (file) => `http://localhost:${port}/${file}`;

    const handleCopy = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleOpen = (file) => {
        ipcRenderer.send(CHANNELS.APP.OPEN_OVERLAY, file);
    };

    return (
        <div className="overlays-tab">
            <div className="group-box">
                <span className="group-title">Galería de Overlays Disponibles</span>
                <p style={{fontSize: 12, color: '#aaa', marginTop: -10, marginBottom: 20}}>
                    Copia estos enlaces y pégalos como "Fuente de Navegador" en OBS Studio.
                </p>

                <div className="overlays-grid">
                    {overlays.map((ov, idx) => {
                        const url = generateUrl(ov.file);
                        return (
                            <div key={idx} className="overlay-card" style={{borderTop: `4px solid ${ov.color}`}}>
                                <div className="overlay-icon-area" style={{backgroundColor: `${ov.color}20`}}>
                                    <span style={{fontSize: 40}}>{ov.icon}</span>
                                </div>
                                <div className="overlay-info">
                                    <h3>{ov.title}</h3>
                                    <p>{ov.desc}</p>

                                    <div className="url-box">
                                        <input type="text" value={url} readOnly />
                                        <button
                                            className={copiedIndex === idx ? "btn-copy copied" : "btn-copy"}
                                            onClick={() => handleCopy(url, idx)}
                                        >
                                            {copiedIndex === idx ? "COPIADO" : "COPIAR URL"}
                                        </button>
                                    </div>

                                    <button className="btn-preview" onClick={() => handleOpen(ov.file)}>
                                        👁️ Abrir en Navegador
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default OverlaysTab;