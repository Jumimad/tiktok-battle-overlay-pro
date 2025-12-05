const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

class ConfigService {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.configPath = path.join(this.userDataPath, 'config.json');
        this.backupPath = path.join(this.userDataPath, 'config.json.bak');
        this.profilesDir = path.join(this.userDataPath, 'profiles');

        this.isSaving = false;
        this.pendingConfig = null;

        // Aseguramos directorios
        fs.ensureDirSync(this.userDataPath);
        fs.ensureDirSync(this.profilesDir);

        this.config = this.load();
    }

    load() {
        try {
            // Intentamos cargar el config normal
            if (fs.existsSync(this.configPath)) {
                const loaded = fs.readJsonSync(this.configPath);
                return { ...this.getDefaults(), ...loaded };
            }
        } catch (e) {
            console.error("[CONFIG] Error crítico cargando config:", e);
            // SI FALLA: Intentamos recuperar el BACKUP
            try {
                if (fs.existsSync(this.backupPath)) {
                    console.warn("[CONFIG] Recuperando desde Backup de Seguridad...");
                    const backup = fs.readJsonSync(this.backupPath);
                    return { ...this.getDefaults(), ...backup };
                }
            } catch (ex) {
                console.error("[CONFIG] Backup también dañado:", ex);
            }
        }
        return this.getDefaults();
    }

    get() { return this.config; }

    async save(newConfig) {
        this.config = { ...this.config, ...newConfig };

        if (this.isSaving) {
            this.pendingConfig = this.config;
            return this.config;
        }

        this.isSaving = true;
        this._writeToDisk();
        return this.config;
    }

    async _writeToDisk() {
        try {
            // 1. CREAR BACKUP DE SEGURIDAD AUTOMÁTICO
            if (fs.existsSync(this.configPath)) {
                await fs.copy(this.configPath, this.backupPath);
            }

            // 2. ESCRIBIR NUEVA CONFIG
            await fs.writeJson(this.configPath, this.config, { spaces: 2 });

        } catch (e) {
            console.error("[CONFIG] Error guardando:", e);
        } finally {
            this.isSaving = false;
            if (this.pendingConfig) {
                const next = this.pendingConfig;
                this.pendingConfig = null;
                this.config = next;
                this.save(next);
            }
        }
    }

    // --- GESTIÓN DE PERFILES ---

    getProfiles() {
        try {
            const files = fs.readdirSync(this.profilesDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
        } catch (e) {
            return [];
        }
    }

    saveProfile(profileName) {
        if (!profileName) return false;
        try {
            const filePath = path.join(this.profilesDir, `${profileName}.json`);
            // Guardamos la configuración ACTUAL como un perfil
            fs.writeJsonSync(filePath, this.config, { spaces: 2 });
            return true;
        } catch (e) {
            console.error("Error guardando perfil:", e);
            return false;
        }
    }

    loadProfile(profileName) {
        try {
            const filePath = path.join(this.profilesDir, `${profileName}.json`);
            if (fs.existsSync(filePath)) {
                const loadedProfile = fs.readJsonSync(filePath);
                // Fusionamos con defaults por seguridad
                this.config = { ...this.getDefaults(), ...loadedProfile };
                // Forzamos guardado en el config principal para activarlo
                this.save(this.config);
                return this.config;
            }
        } catch (e) {
            console.error("Error cargando perfil:", e);
        }
        return null;
    }

    deleteProfile(profileName) {
        try {
            const filePath = path.join(this.profilesDir, `${profileName}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
        } catch (e) { }
        return false;
    }

    getDefaults() {
        return {
            server_port: 8080,
            tikfinity_ws_url: "ws://127.0.0.1:21213/",
            gift_lang: "es-419",
            license_key: "",
            device_id: "",
            allow_gifts_off_timer: false,
            test_params: { timer_minutes: 5, timer_seconds: 0 },
            teams: [
                { id: 'team1', name: 'EQUIPO 1', color: '#FC5895', active: true, icon: '', giftIcon: '', giftName: '' },
                { id: 'team2', name: 'EQUIPO 2', color: '#83F3FF', active: true, icon: '', giftIcon: '', giftName: '' },
                { id: 'team3', name: 'EQUIPO 3', color: '#9D6FD5', active: true, icon: '', giftIcon: '', giftName: '' },
                { id: 'team4', name: 'EQUIPO 4', color: '#D65A4E', active: true, icon: '', giftIcon: '', giftName: '' }
            ],
            layout: {
                overlay_padding_top: 10, container_width: 98, bar_height: 45,
                icon_size: 30, gift_size: 30, font_size: 24,
                timer_top_margin: 8, timer_font_size: 28,
                show_team_icon: true, show_gift_icon: true,
                tap_heart_color: '#FF00FF',
                total_goal_color: '#FFD700',
                tabla_show_total: true,
                tap_goals: [],
                total_point_goals: []
            }
        };
    }
}

module.exports = new ConfigService();