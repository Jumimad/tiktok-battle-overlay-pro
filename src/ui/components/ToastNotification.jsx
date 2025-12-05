import React from 'react';

const ToastContainer = ({ toasts }) => {
    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast ${toast.type}`}>
                    <span>
                        {toast.type === 'success' && '✅'}
                        {toast.type === 'error' && '⚠️'}
                        {toast.type === 'info' && 'ℹ️'}
                    </span>
                    <span>{toast.message}</span>
                </div>
            ))}
        </div>
    );
};

export default ToastContainer;