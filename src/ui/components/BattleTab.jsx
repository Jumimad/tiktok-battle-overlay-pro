import React, { useState, useEffect } from 'react';
import { useBattleSystem } from '../hooks/useBattleSystem';
import CHANNELS from '../../shared/channels';
import GiftSelect from './GiftSelect';

const getIpc = () => {
    if (window.electron && window.electron.ipcRenderer) return window.electron.ipcRenderer;
    return { send: () => {}, on: () => {}, removeAllListeners: () => {} };
};

// CONSTANTE: LÍMITE MÁXIMO DE EQUIPOS
const MAX_TEAMS = 10;

const BattleTab = ({ onShowToast, globalStats }) => {
    const { startBattle, stopBattle, pauseBattle, resetScores, isPaused } = useBattleSystem();
    const [minutes, setMinutes] = useState(5);
    const [seconds, setSeconds] = useState(0);
    const [allowGiftsOffTimer, setAllowGiftsOffTimer] = useState(false);

    const [fullConfig, setFullConfig] = useState({ teams: [] });
    const [gifts, setGifts] = useState([]);

    // ESTADO: CANTIDAD DE EQUIPOS VISIBLES
    const [teamCount, setTeamCount] = useState(2); // Valor inicial seguro

    const ipcRenderer = getIpc();

    useEffect(() => {
        const onConfig = (e, config) => {
            setFullConfig(prev => {
                if (!config || !config.teams) return prev;
                return config;
            });
            if (config?.test_params) {
                setMinutes(config.test_params.timer_minutes || 5);
                setSeconds(config.test_params.timer_seconds || 0);
            }
            if (config?.allow_gifts_off_timer !== undefined) {
                setAllowGiftsOffTimer(config.allow_gifts_off_timer);
            }

            // Detectar cuántos equipos hay activos para ajustar el selector al cargar
            if (config?.teams) {
                const activeCount = config.teams.filter(t => t.active).length;
                // AJUSTE: Permitimos que el mínimo sea 1 equipo (para modo Solo)
                // Si activeCount es 0 (primera vez), ponemos 2 por defecto.
                setTeamCount(activeCount < 1 ? 2 : (activeCount > MAX_TEAMS ? MAX_TEAMS : activeCount));
            }
        };

        const onGifts = (e, list) => setGifts(list);
        const onIconSelected = (e, { index, path }) => handleTeamChange(index, 'icon', path);

        ipcRenderer.on('config-loaded', onConfig);
        ipcRenderer.on(CHANNELS.CONFIG.UPDATED, onConfig);
        ipcRenderer.on(CHANNELS.GIFTS.LIST_UPDATED, onGifts);
        ipcRenderer.on('icon-selected', onIconSelected);

        ipcRenderer.send('request-config');
        ipcRenderer.send(CHANNELS.GIFTS.GET_ALL);

        return () => {
            ipcRenderer.removeAllListeners('config-loaded');
            ipcRenderer.removeAllListeners(CHANNELS.CONFIG.UPDATED);
            ipcRenderer.removeAllListeners(CHANNELS.GIFTS.LIST_UPDATED);
            ipcRenderer.removeAllListeners('icon-selected');
        };
    }, []);

    // --- MANEJADOR DE CANTIDAD DE EQUIPOS ---
    const handleTeamCountChange = (count) => {
        setTeamCount(count);

        setFullConfig(prevConfig => {
            const updatedTeams = [...(prevConfig.teams || [])];

            // Aseguramos que existan equipos hasta el máximo posible
            for(let i=0; i < MAX_TEAMS; i++) {
                if(!updatedTeams[i]) {
                    updatedTeams[i] = {
                        id: `team${i+1}`,
                        name: `Equipo ${i+1}`,
                        color: '#ffffff',
                        active: false
                    };
                }
            }

            // Activamos solo la cantidad seleccionada (count)
            updatedTeams.forEach((team, index) => {
                team.active = index < count;
            });

            const newConfig = { ...prevConfig, teams: updatedTeams };
            ipcRenderer.send(CHANNELS.CONFIG.SAVE, newConfig);
            return newConfig;
        });
    };

    // --- MANEJADOR DE CAMBIOS DE EQUIPO ---
    const handleTeamChange = (index, field, value) => {
        setFullConfig(prevConfig => {
            const updatedTeams = [...(prevConfig.teams || [])];
            if (!updatedTeams[index]) {
                updatedTeams[index] = { id: `team${index+1}`, name: `Equipo ${index+1}`, color: '#ffffff', active: true };
            }

            // 1. Guardar el valor específico
            updatedTeams[index] = { ...updatedTeams[index], [field]: value };

            // 2. Lógica para ICONOS DE REGALOS
            if (field.startsWith('giftName')) {
                const g = gifts.find(gx => gx.name === value);
                const iconUrl = g ? g.icon_url : '';

                // A. Guardar el icono específico (ej: giftIcon_low)
                const suffix = field.includes('_') ? '_' + field.split('_')[1] : '';
                updatedTeams[index][`giftIcon${suffix}`] = iconUrl;

                // B. Compatibilidad Overlay: El regalo 'high' define el icono principal legacy
                if (field === 'giftName_high') {
                    updatedTeams[index].giftName = value;
                    updatedTeams[index].giftIcon = iconUrl;
                }
            }

            const newConfig = { ...prevConfig, teams: updatedTeams };
            ipcRenderer.send(CHANNELS.CONFIG.SAVE, newConfig);
            return newConfig;
        });
    };

    const handleAllowGiftsChange = (checked) => {
        setAllowGiftsOffTimer(checked);
        if (fullConfig && fullConfig.teams) {
            const newConfig = { ...fullConfig, allow_gifts_off_timer: checked };
            ipcRenderer.send(CHANNELS.CONFIG.SAVE, newConfig);
        }
    };

    const handleStart = () => {
        const newTest = { ...(fullConfig.test_params || {}), timer_minutes: parseInt(minutes), timer_seconds: parseInt(seconds) };
        const newConfig = { ...fullConfig, test_params: newTest };
        ipcRenderer.send(CHANNELS.CONFIG.SAVE, newConfig);
        startBattle(minutes, seconds);
    };

    const handleNewSession = () => {
        if(window.confirm("¿Seguro? Esto borrará todos los datos acumulados.")) {
            ipcRenderer.send(CHANNELS.BATTLE.RESET_SESSION);
            if(onShowToast) onShowToast('Sesión reiniciada', 'success');
        }
    };

    const addTime = (secs) => ipcRenderer.send(CHANNELS.BATTLE.ADD_TIME, secs);
    const selectIcon = (idx) => ipcRenderer.send('select-team-icon', idx);

    const stats = globalStats || { taps: 0, diamonds: 0, shares: 0 };

    return (
        <div className="battle-tab">
            <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
                {/* --- SECCIÓN SUPERIOR (ESTADÍSTICAS Y TIEMPO) --- */}
                <div className="col" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div className="group-box" style={{ marginBottom: 0 }}>
                        <span className="group-title">Estadísticas de Transmisión</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, backgroundColor: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{textAlign:'center', flex:1}}><div style={{fontSize:24, fontWeight:800, color:'#FF00FF'}}>{stats.taps.toLocaleString()}</div><div style={{fontSize:11, color:'#aaa', textTransform:'uppercase'}}>Total Taps ❤️</div></div>
                            <div style={{width:1, background:'rgba(255,255,255,0.1)'}}></div>
                            <div style={{textAlign:'center', flex:1}}><div style={{fontSize:24, fontWeight:800, color:'#FFD700'}}>{stats.diamonds.toLocaleString()}</div><div style={{fontSize:11, color:'#aaa', textTransform:'uppercase'}}>Total Gifts 💎</div></div>
                            <div style={{width:1, background:'rgba(255,255,255,0.1)'}}></div>
                            <div style={{textAlign:'center', flex:1}}><div style={{fontSize:24, fontWeight:800, color:'#00CCFF'}}>{stats.shares.toLocaleString()}</div><div style={{fontSize:11, color:'#aaa', textTransform:'uppercase'}}>Compartidos 🔁</div></div>
                        </div>
                    </div>

                    <div className="group-box" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span className="group-title">Tiempo de Batalla</span>
                        <div className="form-group" style={{ flex: 1 }}>
                            <div style={{display:'flex', alignItems:'center', gap: 10, marginBottom: 15}}>
                                <div className="row" style={{flex:1, margin:0}}>
                                    <input type="number" className="col" value={minutes} onChange={e=>setMinutes(e.target.value)} style={{textAlign:'center', fontSize:20}}/><span>m</span>
                                    <input type="number" className="col" value={seconds} onChange={e=>setSeconds(e.target.value)} style={{textAlign:'center', fontSize:20}}/><span>s</span>
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap:5}}>
                                    <button className="btn btn-info btn-sm" onClick={()=>addTime(60)}>+1m</button>
                                    <button className="btn btn-info btn-sm" onClick={()=>addTime(-60)}>-1m</button>
                                </div>
                            </div>
                            <div style={{marginTop: 10, marginBottom: 20}}>
                                <button className="reactor-btn" onClick={handleStart}>🚀 INICIAR BATALLA</button>
                            </div>
                            <div className="row">
                                {isPaused ? <button className="btn btn-success col" onClick={pauseBattle}>▶ REANUDAR</button> : <button className="btn btn-warning col" onClick={pauseBattle}>⏸ PAUSAR</button>}
                                <button className="btn btn-danger col" onClick={stopBattle}>🏁 FINALIZAR</button>
                            </div>
                            <div style={{marginTop: 15, borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:10}}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <span style={{fontSize:12, color:'#aaa'}}>Sumar puntos con Timer APAGADO:</span>
                                    <label className="toggle-switch"><input type="checkbox" checked={allowGiftsOffTimer} onChange={e=>handleAllowGiftsChange(e.target.checked)} /><div className="slider"></div></label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col" style={{ width: '300px', flex: '0 0 300px' }}>
                    <div className="group-box" style={{ height: '100%', marginBottom: 0, boxSizing: 'border-box', display:'flex', flexDirection:'column' }}>
                        <span className="group-title">Gestión de Misión</span>
                        <button className="btn btn-dark" style={{marginBottom: 20, opacity: 0.7, fontSize: 11}} onClick={handleNewSession}>⚠️ Reinicio de Emergencia (Datos)</button>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                            <button className="btn btn-info" style={{justifyContent: 'flex-start'}} onClick={()=>resetScores('battle')}>↺ <span style={{marginLeft: 10}}>Resetear Barra Batalla</span></button>
                            <button className="btn btn-info" style={{justifyContent: 'flex-start'}} onClick={()=>resetScores('stream')}>↺ <span style={{marginLeft: 10}}>Resetear Tabla Total</span></button>
                            <button className="btn btn-info" style={{justifyContent: 'flex-start'}} onClick={()=>resetScores('taps')}>↺ <span style={{marginLeft: 10}}>Resetear Corazón Taps</span></button>
                            <button className="btn btn-info" style={{justifyContent: 'flex-start'}} onClick={()=>resetScores('points')}>↺ <span style={{marginLeft: 10}}>Resetear Estrella Puntos</span></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN EQUIPOS --- */}
            <div className="group-box">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10}}>
                    <span className="group-title" style={{margin:0}}>Escuadrón de Batalla</span>

                    {/* SELECTOR DE CANTIDAD DE EQUIPOS (1 al 10) */}
                    <div style={{display:'flex', gap: 5, alignItems:'center', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', flexWrap: 'wrap'}}>
                        <span style={{fontSize: 12, color: '#aaa', paddingLeft: 5, paddingRight: 5}}>Equipos:</span>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <button
                                key={num}
                                onClick={() => handleTeamCountChange(num)}
                                style={{
                                    background: teamCount === num ? 'var(--neon-blue)' : 'transparent',
                                    color: teamCount === num ? 'white' : '#aaa',
                                    border: 'none', borderRadius: '6px', padding: '4px 8px',
                                    cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', fontSize: '12px'
                                }}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'15px'}}>
                    {/* Renderizamos solo la cantidad seleccionada */}
                    {Array.from({ length: teamCount }).map((_, idx) => {
                        const team = (fullConfig.teams && fullConfig.teams[idx]) || { name:`Equipo ${idx+1}`, color:'#fff', active:true };

                        return (
                            <div key={idx} className={`team-card active`} style={{ position: 'relative', zIndex: 50 - idx }}>
                                <div className="team-card-header">
                                    <span className="team-badge" style={{color: team.color}}>EQ {idx+1}</span>
                                    <div style={{width: 10, height: 10, borderRadius: '50%', background: '#32d74b', boxShadow: '0 0 5px #32d74b'}}></div>
                                </div>
                                <div style={{display:'flex', gap:10, marginBottom:15, alignItems: 'center'}}>
                                    <input type="text" value={team.name||''} onChange={e=>handleTeamChange(idx, 'name', e.target.value)} placeholder="Nombre del Equipo" style={{flex:1}}/>
                                    <div style={{position: 'relative', width: 40, height: 40, borderRadius: '50%', backgroundColor: team.color || '#ffffff', border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 5px rgba(0,0,0,0.2)'}} title="Color del Equipo"><input type="color" value={team.color||'#ffffff'} onChange={e=>handleTeamChange(idx, 'color', e.target.value)} style={{position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', opacity: 0, cursor: 'pointer'}} /></div>
                                </div>

                                {/* 3 NIVELES DE REGALOS */}
                                <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:15, position:'relative', zIndex: 100 - idx, background: 'rgba(0,0,0,0.2)', padding:10, borderRadius:12}}>

                                    <div>
                                        <div style={{fontSize: 10, color: '#83F3FF', marginBottom: 3, fontWeight:'bold', textTransform:'uppercase'}}>🔹 Regalo Bajo</div>
                                        <GiftSelect options={gifts} value={team.giftName_low} onChange={(val) => handleTeamChange(idx, 'giftName_low', val)} />
                                    </div>

                                    <div>
                                        <div style={{fontSize: 10, color: '#FC5895', marginBottom: 3, fontWeight:'bold', textTransform:'uppercase'}}>🔸 Regalo Medio</div>
                                        <GiftSelect options={gifts} value={team.giftName_mid} onChange={(val) => handleTeamChange(idx, 'giftName_mid', val)} />
                                    </div>

                                    <div>
                                        <div style={{fontSize: 10, color: '#FFD700', marginBottom: 3, fontWeight:'bold', textTransform:'uppercase'}}>👑 Regalo Grande (Meta)</div>
                                        <GiftSelect options={gifts} value={team.giftName_high} onChange={(val) => handleTeamChange(idx, 'giftName_high', val)} />
                                    </div>

                                </div>

                                <div style={{display:'flex', gap:5}}>
                                    <input type="text" readOnly value={team.icon?'Imagen Cargada':''} placeholder="Sin Imagen" style={{flex:1, fontSize:11, opacity:0.7}}/>
                                    <button className="btn btn-sm btn-info" onClick={()=>selectIcon(idx)}>📂</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default BattleTab;