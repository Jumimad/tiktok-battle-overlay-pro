// --- web/common.js ---

let currentSettings = {};
let currentScores = {};
let currentStreamScores = {};

function animateValue(element, start, end, duration) {
    if (!element) return;
    if (duration === 0 || Math.abs(end - start) > 10000) {
        element.innerText = Math.floor(end);
        return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        element.innerText = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function connectToServer() {
    const wsURL = "ws://127.0.0.1:8080";
    console.log(`[WS] Conectando a ${wsURL}...`);
    const ws = new WebSocket(wsURL);

    ws.onopen = () => {
        console.log("¡Conectado al Overlay!");
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);

            if (message.type === 'config') {
                currentSettings = message.data;
                if (typeof handleConfig === "function") handleConfig(message.data);
            }
            else if (message.type === 'scores') {
                currentScores = message.data;
                if (typeof handleScores === "function") handleScores(message.data);
            }
            else if (message.type === 'stream_scores') {
                currentStreamScores = message.data;
                if (typeof handleStreamScores === "function") handleStreamScores(message.data);
            }
            else if (message.type === 'TIMER_UPDATE') {
                const d = message.data;
                const secs = (typeof d === 'object') ? d.seconds : parseInt(d);
                const run = (typeof d === 'object') ? d.running : true;
                const paused = (typeof d === 'object') ? d.paused : false;
                if (typeof handleTimer === "function") handleTimer(secs, run, paused);
            }
            else if (message.type === 'BATTLE_END' && typeof handleWinner === "function") {
                handleWinner(message.data.winner);
            }
            // --- MÓDULOS CLAVE ---
            else if (message.type === 'TAPS_UPDATE') {
                if (typeof handleTapUpdate === "function") {
                    handleTapUpdate(message.data);
                }
            }
            else if (message.type === 'TOTAL_POINTS_UPDATE') {
                if (typeof handleTotalPointsUpdate === "function") {
                    handleTotalPointsUpdate(message.data);
                }
            }
            else if (message.type === 'REFRESH') window.location.reload(true);

        } catch (e) {
            console.error("Error procesando mensaje:", e);
        }
    };

    ws.onclose = () => {
        console.log("Desconectado. Reintentando en 3s...");
        setTimeout(connectToServer, 3000);
    };

    ws.onerror = (err) => {
        console.error("Error WS:", err);
        ws.close();
    };
}

// Iniciar
connectToServer();