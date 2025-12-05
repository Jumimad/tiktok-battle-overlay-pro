import React, { useState } from 'react';

const LicenseModal = ({ onLoginSuccess }) => {
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Invocamos al backend para validar
            const result = await window.electron.ipcRenderer.invoke('license:login', token);

            if (result.success) {
                onLoginSuccess(); // ¡Desbloquear App!
            } else {
                setError(result.error || 'Licencia inválida');
            }
        } catch (err) {
            setError('Error de comunicación con el software.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="license-overlay">
            <div className="license-box">
                <div className="license-icon">🔒</div>
                <h2>Activación Requerida</h2>
                <p>Por favor, ingresa tu Token de Acceso para utilizar <b>TikBattle OS</b>.</p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="license-input"
                        placeholder="XXXX-XXXX-XXXX"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={loading}
                    />

                    {error && <div className="license-error">{error}</div>}

                    <button type="submit" className="btn btn-success license-btn" disabled={loading || !token}>
                        {loading ? 'Verificando...' : '🔓 Desbloquear Sistema'}
                    </button>
                </form>

                <div className="license-footer">
                    <label style={{display:'flex', alignItems:'center', gap:5, justifyContent:'center', opacity:0.7, fontSize:12}}>
                        <input type="checkbox" checked readOnly /> Recordar mi licencia
                    </label>
                </div>
            </div>
        </div>
    );
};

export default LicenseModal;