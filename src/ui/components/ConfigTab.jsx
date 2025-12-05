import React, { useState, useEffect, useRef } from 'react';
import CHANNELS from '../../shared/channels';

const getIpc = () => {
    if (window.electron && window.electron.ipcRenderer) return window.electron.ipcRenderer;
    return { send: () => {}, on: () => {}, removeAllListeners: () => {} };
};

// --- HELPERS ---
const formatNumber = (num) => {
    if (num === '' || num === undefined || num === null) return '';
    return new Intl.NumberFormat('en-US').format(num);
};

const parseNumber = (str) => {
    const clean = String(str).replace(/,/g, '').replace(/\D/g, '');
    return clean === '' ? '' : parseInt(clean, 10);
};

// --- COMPONENTE GOAL EDITOR ---
const GoalEditor = ({ title, goals = [], valueKey, colorKey, onUpdate, onColorChange, currentColor }) => {
    const [recycleBin, setRecycleBin] = useState(null);

    const addGoal = () => {
        let newGoal;
        if (recycleBin) {
            newGoal = recycleBin;
            setRecycleBin(null);
        } else {
            const baseValue = valueKey === 'taps' ? 10000 : 5000;
            const lastValue = goals.length > 0 ? parseInt(goals[goals.length-1][valueKey] || 0) : 0;
            newGoal = { [valueKey]: lastValue + baseValue, name: `Meta ${goals.length + 1}` };
        }
        onUpdate([...goals, newGoal]);
    };

    const removeGoal = (index) => {
        setRecycleBin(goals[index]);
        onUpdate(goals.filter((_, i) => i !== index));
    };

    const handleEdit = (index, field, rawValue) => {
        const updatedGoals = [...goals];
        let val = rawValue;
        if (field === valueKey) val = parseNumber(rawValue);
        updatedGoals[index] = { ...updatedGoals[index], [field]: val };
        onUpdate(updatedGoals);
    };

    const mainColor = currentColor || '#FFF';

    return (
        <div className="group-box" style={{ marginTop: 20, borderLeft: `4px solid ${mainColor}` }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                <span className="group-title" style={{color: mainColor, margin:0}}>{title}</span>
                <div style={{display:'flex', gap:10, alignItems:'center'}}>
                    <div style={{position: 'relative', width: 30, height: 30, borderRadius: '50%', backgroundColor: mainColor, border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.3)'}} title="Cambiar Color">
                        <input type="color" value={mainColor} onChange={(e) => onColorChange(colorKey, e.target.value)} style={{position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', opacity: 0, cursor: 'pointer'}} />
                    </div>
                    <button className="btn btn-success btn-sm" onClick={addGoal}>{recycleBin ? '↩ Recuperar' : '+ Añadir'}</button>
                </div>
            </div>
            {goals.length === 0 ? <div style={{textAlign:'center', opacity:0.5, fontSize:12}}>Sin metas activas</div> :
                goals.map((g, i) => (
                    <div key={i} style={{display:'flex', gap:10, marginBottom:8}}>
                        <div style={{width:20, paddingTop:10, fontSize:12, opacity:0.5}}>{i+1}</div>
                        <input type="text" value={formatNumber(g[valueKey])} onChange={(e) => handleEdit(i, valueKey, e.target.value)} style={{width: 120, textAlign: 'right', fontWeight:'bold', color: '#fff'}} placeholder="0"/>
                        <input type="text" value={g.name || ''} onChange={(e) => handleEdit(i, 'name', e.target.value)} style={{flex: 1}} placeholder="Nombre de la Meta"/>
                        <button className="btn btn-danger btn-sm" onClick={() => removeGoal(i)}>×</button>
                    </div>
                ))
            }
        </div>
    );
};

// --- COMPONENTE GESTOR DE PERFILES (NUEVO) ---
const ProfileManager = ({ onShowToast }) => {
    const ipcRenderer = getIpc();
    const [profiles, setProfiles] = useState([]);
    const [newProfileName, setNewProfileName] = useState('');

    useEffect(() => {
        const onList = (e, list) => setProfiles(list);
        ipcRenderer.on(CHANNELS.PROFILES.LIST_UPDATED, onList);
        ipcRenderer.send(CHANNELS.PROFILES.GET_ALL);
        return () => ipcRenderer.removeAllListeners(CHANNELS.PROFILES.LIST_UPDATED);
    }, []);

    const handleSaveProfile = () => {
        if (!newProfileName.trim()) return;
        ipcRenderer.send(CHANNELS.PROFILES.SAVE, newProfileName);
        setNewProfileName('');
        if (onShowToast) onShowToast(`Perfil "${newProfileName}" guardado`, 'success');
    };

    const handleLoadProfile = (name) => {
        if (window.confirm(`¿Cargar el perfil "${name}"? Se reemplazarán los ajustes actuales.`)) {
            ipcRenderer.send(CHANNELS.PROFILES.LOAD, name);
            if (onShowToast) onShowToast(`Perfil "${name}" cargado`, 'success');
        }
    };

    const handleDeleteProfile = (name) => {
        if (window.confirm(`¿Eliminar permanentemente "${name}"?`)) {
            ipcRenderer.send(CHANNELS.PROFILES.DELETE, name);
        }
    };

    return (
        <div className="group-box" style={{marginBottom: 20, borderLeft: '4px solid #0a84ff'}}>
            <span className="group-title" style={{color:'#0a84ff'}}>💾 Gestor de Perfiles</span>

            <div style={{display:'flex', gap:10, marginBottom:15}}>
                <input
                    type="text"
                    placeholder="Nombre nuevo perfil (ej: Viernes Terror)"
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    style={{flex:1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white'}}
                />
                <button className="btn btn-primary" onClick={handleSaveProfile} disabled={!newProfileName} style={{backgroundColor: '#0a84ff'}}>Guardar Actual</button>
            </div>

            {profiles.length > 0 && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxHeight: '150px', overflowY: 'auto'}}>
                    {profiles.map(p => (
                        <div key={p} style={{background:'rgba(255,255,255,0.05)', padding:'8px 12px', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span style={{fontWeight:'bold', fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={p}>{p}</span>
                            <div style={{display:'flex', gap:5}}>
                                <button className="btn btn-sm btn-success" onClick={() => handleLoadProfile(p)} title="Cargar">📂</button>
                                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProfile(p)} title="Borrar">🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const ConfigTab = ({ onShowToast }) => {
    const ipcRenderer = getIpc();
    const [config, setConfig] = useState(null);
    const [isLicensed, setIsLicensed] = useState(false);
    const saveTimeoutRef = useRef(null);
    const isLoaded = useRef(false);

    useEffect(() => {
        const onConfigLoaded = (event, loadedConfig) => {
            if (!loadedConfig) return;
            // Si recibimos una carga forzada (ej: al cargar perfil), desbloqueamos isLoaded temporalmente
            // Pero para la carga inicial normal, usamos el lock

            setConfig(prev => ({
                ...prev,
                ...loadedConfig,
                layout: { ...prev?.layout, ...(loadedConfig.layout || {}) }
            }));

            // Pequeño hack: Si viene de cargar perfil, forzamos update visual
            if (!isLoaded.current) isLoaded.current = true;
        };

        const onLicenseStatus = (event, isValid) => setIsLicensed(isValid);

        // Escuchamos carga inicial Y actualizaciones forzadas (perfiles)
        ipcRenderer.on('config-loaded', onConfigLoaded);
        ipcRenderer.on(CHANNELS.CONFIG.UPDATED, (e, newConf) => {
            setConfig(newConf); // Actualización directa al cargar perfil
        });
        ipcRenderer.on('license-status', onLicenseStatus);

        ipcRenderer.send('request-config');

        return () => {
            ipcRenderer.removeAllListeners('config-loaded');
            ipcRenderer.removeAllListeners(CHANNELS.CONFIG.UPDATED);
            ipcRenderer.removeAllListeners('license-status');
        };
    }, []);

    const triggerSave = (newConfig) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            ipcRenderer.send(CHANNELS.CONFIG.SAVE, newConfig);
            if (onShowToast) onShowToast('Configuración Guardada', 'success');
        }, 500);
    };

    // Manejadores
    const handleLayout = (field, value) => {
        setConfig(prev => {
            const newConfig = { ...prev, layout: { ...prev.layout, [field]: value } };
            triggerSave(newConfig);
            return newConfig;
        });
    };
    const handleGoalsUpdate = (field, newGoals) => {
        setConfig(prev => {
            const newConfig = { ...prev, layout: { ...prev.layout, [field]: newGoals } };
            triggerSave(newConfig);
            return newConfig;
        });
    };
    const handleSimpleChange = (field, value) => {
        setConfig(prev => {
            const newConfig = { ...prev, [field]: value };
            triggerSave(newConfig);
            return newConfig;
        });
    };

    const Slider = ({ label, field, min, max }) => (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color:'#ddd' }}>{label}</div>
            <div style={{ width: 40, textAlign: 'right', fontWeight: 'bold', fontSize: 13, marginRight: 10 }}>{config?.layout[field]}</div>
            <input type="range" min={min} max={max} value={config?.layout[field] || min} onChange={(e) => handleLayout(field, parseInt(e.target.value))} style={{ flex: 2 }} />
        </div>
    );

    if (!config) return <div>Cargando...</div>;

    return (
        <div className="config-tab">

            {/* GESTOR DE PERFILES (Integrado Arriba) */}
            <ProfileManager onShowToast={onShowToast} />

            {/* LICENCIA */}
            <div className="group-box" style={{ borderLeft: isLicensed ? '4px solid #32d74b' : '4px solid #ff453a' }}>
                <span className="group-title" style={{color: isLicensed ? '#32d74b' : '#ff453a'}}>Licencia del Producto</span>
                <div className="row">
                    <div className="col">
                        <label style={{fontSize:12, color:'#aaa', display:'block', marginBottom:5}}>Token de Acceso</label>
                        <div style={{display:'flex', gap:10, alignItems:'center'}}>
                            <input type="text" value={config.license_key || ""} onChange={e => handleSimpleChange('license_key', e.target.value)} placeholder="Pegue su token aquí" style={{borderColor: isLicensed ? '#32d74b' : '#ff453a', color: isLicensed ? '#32d74b' : '#fff', background: isLicensed ? 'rgba(50, 215, 75, 0.1)' : 'rgba(255, 69, 58, 0.1)'}} />
                            {isLicensed ? <span style={{fontSize:20}}>✅</span> : <span style={{fontSize:20}}>🔒</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* CONEXIONES */}
            <div className="group-box">
                <span className="group-title">Conexiones</span>
                <div className="row">
                    <div className="col" style={{flex:1}}>
                        <label style={{fontSize:12, color:'#aaa', display:'block', marginBottom:5}}>Puerto OBS</label>
                        <input type="number" value={config.server_port} onChange={e => handleSimpleChange('server_port', parseInt(e.target.value) || 8080)} />
                    </div>
                    <div className="col" style={{flex:3}}>
                        <label style={{fontSize:12, color:'#aaa', display:'block', marginBottom:5}}>Enlace TikFinity</label>
                        <input type="text" value={config.tikfinity_ws_url} onChange={e => handleSimpleChange('tikfinity_ws_url', e.target.value)} />
                    </div>
                </div>
                <div className="row" style={{marginTop: 15}}>
                    <div className="col">
                        <label style={{fontSize:12, color:'#aaa', display:'block', marginBottom:5}}>Idioma Regalos</label>
                        <input type="text" value={config.gift_lang || "es-419"} onChange={e => handleSimpleChange('gift_lang', e.target.value)} />
                    </div>
                </div>
            </div>

            {/* DISEÑO */}
            <div className="group-box">
                <span className="group-title">Diseño del Overlay</span>
                <div style={{ padding: '10px 0' }}>
                    <Slider label="Ancho Contenedor (%)" field="container_width" min={50} max={100} />
                    <Slider label="Padding Superior (px)" field="overlay_padding_top" min={0} max={600} />
                    <Slider label="Altura Barras (px)" field="bar_height" min={20} max={200} />
                    <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '15px 0' }} />
                    <Slider label="Tamaño Iconos" field="icon_size" min={20} max={100} />
                    <Slider label="Tamaño Regalos" field="gift_size" min={10} max={80} />
                    <Slider label="Tamaño Texto" field="font_size" min={14} max={60} />
                    <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '15px 0' }} />
                    <Slider label="Tamaño Timer" field="timer_font_size" min={14} max={80} />
                </div>
                <div style={{ marginTop: 10 }}>
                    <div className="toggle-wrapper">
                        <span className="toggle-text">Mostrar Fotos de Perfil</span>
                        <label className="toggle-switch"><input type="checkbox" checked={config.layout.show_team_icon !== false} onChange={e => handleLayout('show_team_icon', e.target.checked)} /><div className="slider"></div></label>
                    </div>
                    <div className="toggle-wrapper">
                        <span className="toggle-text">Mostrar Iconos de Regalo</span>
                        <label className="toggle-switch"><input type="checkbox" checked={config.layout.show_gift_icon !== false} onChange={e => handleLayout('show_gift_icon', e.target.checked)} /><div className="slider"></div></label>
                    </div>
                    <div className="toggle-wrapper">
                        <span className="toggle-text">Mostrar Total de Tabla</span>
                        <label className="toggle-switch"><input type="checkbox" checked={config.layout.tabla_show_total !== false} onChange={e => handleLayout('tabla_show_total', e.target.checked)} /><div className="slider"></div></label>
                    </div>
                </div>
            </div>

            {/* METAS */}
            <GoalEditor title="❤️ Metas de Taps" goals={config.layout.tap_goals} valueKey="taps" colorKey="tap_heart_color" currentColor={config.layout.tap_heart_color} onUpdate={(nD) => handleGoalsUpdate('tap_goals', nD)} onColorChange={handleLayout} />
            <GoalEditor title="⭐ Metas de Puntos" goals={config.layout.total_point_goals} valueKey="points" colorKey="total_goal_color" currentColor={config.layout.total_goal_color} onUpdate={(nD) => handleGoalsUpdate('total_point_goals', nD)} onColorChange={handleLayout} />

            <div style={{ marginTop: 20, textAlign: 'center', opacity: 0.5, fontSize: 12 }}>✅ Autoguardado Activo</div>
        </div>
    );
};

export default ConfigTab;