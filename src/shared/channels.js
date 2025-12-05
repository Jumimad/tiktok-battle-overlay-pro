module.exports = {
    CONFIG: {
        GET: 'config:get',
        SAVE: 'config:save',
        UPDATED: 'config:updated'
    },
    // --- NUEVOS CANALES PARA PERFILES ---
    PROFILES: {
        GET_ALL: 'profiles:get-all',
        LOAD: 'profiles:load',
        SAVE: 'profiles:save',
        DELETE: 'profiles:delete',
        LIST_UPDATED: 'profiles:list-updated'
    },
    BATTLE: {
        START: 'battle:start',
        STOP: 'battle:stop',
        PAUSE: 'battle:pause',
        ADD_TIME: 'battle:add-time',
        RESET_SCORES: 'battle:reset-scores',
        RESET_STREAM: 'battle:reset-stream',
        RESET_TAPS: 'battle:reset-taps',
        RESET_POINTS: 'battle:reset-points',
        UPDATE_TIMER: 'battle:update-timer',
        RESET_SESSION: 'battle:reset-session',
        UPDATE_SCORES: 'battle:update-scores',
        UPDATE_STREAM_SCORES: 'battle:update-stream-scores',
        END: 'battle:end'
    },
    STATS: {
        UPDATE: 'stats-update'
    },
    LICENSE: {
        CHECK: 'license:check',
        STATUS: 'license:status'
    },
    TEST: {
        GIFT: 'test:gift',
        GLOBAL_GIFT: 'test:global',
        TAPS: 'test:taps',
        SHARE: 'test:share'
    },
    GIFTS: {
        GET_ALL: 'gifts:get-all',
        LIST_UPDATED: 'gifts:list-updated'
    },
    APP: {
        OPEN_OVERLAY: 'app:open-overlay',
        SELECT_ICON: 'app:select-icon',
        LOG: 'log'
    }
};