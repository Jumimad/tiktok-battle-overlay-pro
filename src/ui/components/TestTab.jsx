import React, { useState, useEffect } from 'react';
import CHANNELS from '../../shared/channels';

const getIpc = () => {
    if (window.electron && window.electron.ipcRenderer) return window.electron.ipcRenderer;
    return { send: () => {}, on: () => {}, removeAllListeners: () => {} };
};

const TestTab = () => {
    const ipcRenderer = getIpc();

    // Estados de valores de prueba
    const [globalPoints, setGlobalPoints] = useState(500);
    const [taps, setTaps] = useState(1000);
    const [battlePoints, setBattlePoints] = useState(100);
    const [shares, setShares] = useState(10);

    // Estado para los botones dinámicos
    const [activeTeams, setActiveTeams] = useState([]);

    // --- CARGAR EQUIPOS ACTIVOS ---
    useEffect(() => {
        const onConfig = (e, config) => {
            if (config && config.teams) {
                // Filtramos solo los equipos que están marcados como activos
                // (Esto respeta la selección de 2, 3... 10 equipos que hiciste en BattleTab)
                const teamsToShow = config.teams.filter(t => t.active !== false);
                setActiveTeams(teamsToShow);
            }
        };

        ipcRenderer.on('config-loaded', onConfig);
        ipcRenderer.on(CHANNELS.CONFIG.UPDATED, onConfig); // Escuchar cambios en tiempo real

        ipcRenderer.send('request-config');

        return () => {
            ipcRenderer.removeAllListeners('config-loaded');
            ipcRenderer.removeAllListeners(CHANNELS.CONFIG.UPDATED);
        };
    }, []);

    // MÓDULO 1: ESTRELLA
    const sendGlobalGift = () => {
        ipcRenderer.send(CHANNELS.TEST.GLOBAL_GIFT, globalPoints);
    };

    // MÓDULO 2: TAPS
    const sendTaps = () => {
        ipcRenderer.send(CHANNELS.TEST.TAPS, taps);
    };

    // MÓDULO 3: BATALLA (Equipos)
    const sendBattleGift = (teamId) => {
        ipcRenderer.send(CHANNELS.TEST.GIFT, { teamId, points: battlePoints });
    };

    // MÓDULO 4: SHARES
    const sendShares = () => {
        ipcRenderer.send(CHANNELS.TEST.SHARE, shares);
    };

    return (
        <div className="test-tab">

            {/* MÓDULO 1: ESTRELLA (REGALOS GLOBALES) */}
            <div className="group-box" style={{borderLeft: '4px solid #FFD700'}}>
                <span className="group-title" style={{color:'#FFD700'}}>⭐ Módulo 1: Meta Global (Estrella)</span>
                <p style={{fontSize:12, opacity:0.6}}>Suma a la estrella sin afectar a ningún equipo.</p>
                <div style={{display:'flex', gap:10}}>
                    <input type="number" value={globalPoints} onChange={e=>setGlobalPoints(e.target.value)} className="form-control" style={{width:100}} />
                    <button className="btn btn-warning" onClick={sendGlobalGift} style={{flex:1, color:'#000'}}>
                        Enviar Regalo Random (+{globalPoints})
                    </button>
                </div>
            </div>

            {/* MÓDULO 2: LIKES (CORAZÓN) */}
            <div className="group-box" style={{borderLeft: '4px solid #FF00FF'}}>
                <span className="group-title" style={{color:'#FF00FF'}}>❤️ Módulo 2: Likes (Corazón)</span>
                <div style={{display:'flex', gap:10}}>
                    <input type="number" value={taps} onChange={e=>setTaps(e.target.value)} className="form-control" style={{width:100}} />
                    <button className="btn" style={{backgroundColor:'#FF00FF', color:'white', flex:1}} onClick={sendTaps}>
                        Simular Taps (+{taps})
                    </button>
                </div>
            </div>

            {/* MÓDULO 3: BATALLA (TABLA) - ¡AHORA DINÁMICO! */}
            <div className="group-box" style={{borderLeft: '4px solid #007AFF'}}>
                <span className="group-title" style={{color:'#007AFF'}}>⚔️ Módulo 3: Batalla (Equipos)</span>
                <p style={{fontSize:12, opacity:0.6}}>Suma a la tabla y también a la estrella.</p>

                <div style={{marginBottom:10}}>
                    <label style={{fontSize:12, color:'#aaa'}}>Puntos por regalo:</label>
                    <input type="number" value={battlePoints} onChange={e=>setBattlePoints(e.target.value)} className="form-control" />
                </div>

                {/* RENDERING DINÁMICO DE BOTONES */}
                {activeTeams.length === 0 ? (
                    <div style={{opacity: 0.5, fontStyle: 'italic', textAlign: 'center'}}>Cargando equipos...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {activeTeams.map((team, index) => (
                            <button
                                key={team.id}
                                className="btn"
                                onClick={() => sendBattleGift(team.id)}
                                style={{
                                    backgroundColor: team.color || '#555', // Usamos el color real del equipo
                                    color: 'white',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.8)', // Sombra para leer bien el texto
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '10px 15px'
                                }}
                            >
                                <span>EQ {index + 1}</span>
                                <span style={{fontWeight: 'bold', fontSize: '11px', opacity: 0.9}}>{team.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* MÓDULO 4: SHARES */}
            <div className="group-box" style={{borderLeft: '4px solid #32D74B'}}>
                <span className="group-title" style={{color:'#32D74B'}}>📢 Módulo 4: Compartidos</span>
                <div style={{display:'flex', gap:10}}>
                    <input type="number" value={shares} onChange={e=>setShares(e.target.value)} className="form-control" style={{width:100}} />
                    <button className="btn" style={{backgroundColor:'#32D74B', color:'white', flex:1}} onClick={sendShares}>
                        Simular Shares (+{shares})
                    </button>
                </div>
            </div>

        </div>
    );
};

export default TestTab;