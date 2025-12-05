import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App'; // Importamos tu App desde la carpeta ui

// Buscamos el div con id "root" en tu index.html y renderizamos la App
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);