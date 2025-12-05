const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        // Enviar mensajes (Frontend -> Backend)
        send: (channel, data) => ipcRenderer.send(channel, data),

        // Recibir mensajes (Backend -> Frontend)
        on: (channel, func) => {
            const subscription = (event, ...args) => func(event, ...args);
            ipcRenderer.on(channel, subscription);
        },

        once: (channel, func) => {
            ipcRenderer.once(channel, (event, ...args) => func(event, ...args));
        },

        removeAllListeners: (channel) => {
            ipcRenderer.removeAllListeners(channel);
        },

        // --- ESTA ES LA CLAVE PARA EL LOGIN ---
        invoke: (channel, data) => ipcRenderer.invoke(channel, data)
    }
});