// Application State Management
export const STATE_VERSION = "1.1.0";


export const state = {
    matches: [],
    standings: {},
    betSlip: [],
    activeModalMatchId: null,
    knockoutMatches: [],
    squadValuesStats: {},
    h2hStats: {},
    recurrencesStats: {},
    statsbombStats: {},
    gbdtBaselines: {},
    TEAMS_DB: {},
    tournamentEvents: [],
    simulationHistory: []
};

// State validation helpers
function isValidArray(val) {
    return Array.isArray(val);
}

function isValidObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// Caching and session restoration
export function saveLocalState() {
    try {
        localStorage.setItem('wc2026_state_version', STATE_VERSION);
        localStorage.setItem('wc2026_matches', JSON.stringify(state.matches));
        localStorage.setItem('wc2026_knockoutMatches', JSON.stringify(state.knockoutMatches));
        localStorage.setItem('wc2026_betSlip', JSON.stringify(state.betSlip));
        localStorage.setItem('wc2026_TEAMS_DB', JSON.stringify(state.TEAMS_DB));
        localStorage.setItem('wc2026_tournamentEvents', JSON.stringify(state.tournamentEvents));
        localStorage.setItem('wc2026_sim_history', JSON.stringify(state.simulationHistory));
    } catch (e) {
        console.error('Errore nel salvataggio dello stato in LocalStorage:', e);
    }
}

export function loadLocalState() {
    try {
        const savedVersion = localStorage.getItem('wc2026_state_version');
        if (savedVersion !== STATE_VERSION) {
            console.warn(`Versione dello stato obsoleta o mancante (${savedVersion} vs ${STATE_VERSION}). Resettaggio della cache.`);
            clearLocalState();
            return false;
        }

        const m = localStorage.getItem('wc2026_matches');
        const km = localStorage.getItem('wc2026_knockoutMatches');
        const bs = localStorage.getItem('wc2026_betSlip');
        const db = localStorage.getItem('wc2026_TEAMS_DB');
        const te = localStorage.getItem('wc2026_tournamentEvents');

        if (m) {
            const parsed = JSON.parse(m);
            if (isValidArray(parsed)) state.matches = parsed;
        }
        if (km) {
            const parsed = JSON.parse(km);
            if (isValidArray(parsed)) state.knockoutMatches = parsed;
        }
        if (bs) {
            const parsed = JSON.parse(bs);
            if (isValidArray(parsed)) state.betSlip = parsed;
        }
        if (db) {
            const parsed = JSON.parse(db);
            if (isValidObject(parsed)) state.TEAMS_DB = parsed;
        }
        if (te) {
            const parsed = JSON.parse(te);
            if (isValidArray(parsed)) state.tournamentEvents = parsed;
        }
        const sh = localStorage.getItem('wc2026_sim_history');
        if (sh) {
            const parsed = JSON.parse(sh);
            if (isValidArray(parsed)) state.simulationHistory = parsed;
        } else {
            state.simulationHistory = [];
        }
        
        return !!db && isValidObject(state.TEAMS_DB) && Object.keys(state.TEAMS_DB).length > 0;
    } catch (e) {
        console.error('Errore nel caricamento dello stato da LocalStorage:', e);
        clearLocalState();
        return false;
    }
}

export function clearLocalState() {
    localStorage.removeItem('wc2026_state_version');
    localStorage.removeItem('wc2026_matches');
    localStorage.removeItem('wc2026_knockoutMatches');
    localStorage.removeItem('wc2026_betSlip');
    localStorage.removeItem('wc2026_TEAMS_DB');
    localStorage.removeItem('wc2026_tournamentEvents');
    localStorage.removeItem('wc2026_sim_history');
}

export function clearSimulationHistory() {
    state.simulationHistory = [];
    localStorage.removeItem('wc2026_sim_history');
}

export function exportStateAsJson() {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
            matches: state.matches,
            knockoutMatches: state.knockoutMatches,
            TEAMS_DB: state.TEAMS_DB,
            tournamentEvents: state.tournamentEvents,
            betSlip: state.betSlip
        }));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `mondiali2026_backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    } catch (e) {
        console.error("Errore nell'esportazione del backup:", e);
    }
}

export function importStateFromJson(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (data.matches && data.knockoutMatches && data.TEAMS_DB) {
            state.matches = data.matches;
            state.knockoutMatches = data.knockoutMatches;
            state.TEAMS_DB = data.TEAMS_DB;
            state.tournamentEvents = data.tournamentEvents || [];
            state.betSlip = data.betSlip || [];
            saveLocalState();
            return true;
        }
        return false;
    } catch (e) {
        console.error("Errore nell'importazione del backup:", e);
        return false;
    }
}
