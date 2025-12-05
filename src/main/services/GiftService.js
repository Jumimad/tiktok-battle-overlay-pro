const https = require('https');

class GiftService {
    constructor() {
        this.gifts = [];
        this.lastFetchTime = 0;
        this.CACHE_DURATION = 10 * 60 * 1000;
        this.apiUrl = "https://tikfinity.zerody.one/api/getAllGifts?lang=";
    }

    fetchGifts(language = 'es-419') {
        return new Promise((resolve) => {
            const now = Date.now();

            // 1. Cache
            if (this.gifts.length > 0 && (now - this.lastFetchTime < this.CACHE_DURATION)) {
                resolve(this.gifts);
                return;
            }

            // 2. Descarga Nativa
            https.get(`${this.apiUrl}${language}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const raw = Array.isArray(parsed) ? parsed : (parsed.gifts || []);

                        this.gifts = raw.map(g => ({
                            name: g.name,
                            id: g.id,
                            diamond_count: g.diamond_count,
                            icon_url: g.image?.url_list?.[0] || ''
                        })).sort((a, b) => a.diamond_count - b.diamond_count);

                        this.lastFetchTime = now;
                        resolve(this.gifts);
                    } catch (e) {
                        console.error("Error parseando regalos:", e);
                        resolve(this.gifts);
                    }
                });
            }).on('error', (err) => {
                console.error("Error red regalos:", err);
                resolve(this.gifts);
            });
        });
    }
}

// EXPORTAMOS LA CLASE
module.exports = GiftService;