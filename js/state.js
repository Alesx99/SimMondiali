// Application State Management
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
    TEAMS_DB: {},
    tournamentEvents: []
};

// Caching and session restoration
export function saveLocalState() {
    try {
        localStorage.setItem('wc2026_matches', JSON.stringify(state.matches));
        localStorage.setItem('wc2026_knockoutMatches', JSON.stringify(state.knockoutMatches));
        localStorage.setItem('wc2026_betSlip', JSON.stringify(state.betSlip));
        localStorage.setItem('wc2026_TEAMS_DB', JSON.stringify(state.TEAMS_DB));
        localStorage.setItem('wc2026_tournamentEvents', JSON.stringify(state.tournamentEvents));
    } catch (e) {
        console.error('Errore nel salvataggio dello stato in LocalStorage:', e);
    }
}

export function loadLocalState() {
    try {
        const m = localStorage.getItem('wc2026_matches');
        const km = localStorage.getItem('wc2026_knockoutMatches');
        const bs = localStorage.getItem('wc2026_betSlip');
        const db = localStorage.getItem('wc2026_TEAMS_DB');
        const te = localStorage.getItem('wc2026_tournamentEvents');

        if (m) state.matches = JSON.parse(m);
        if (km) state.knockoutMatches = JSON.parse(km);
        if (bs) state.betSlip = JSON.parse(bs);
        if (db) state.TEAMS_DB = JSON.parse(db);
        if (te) state.tournamentEvents = JSON.parse(te);
        
        return !!db; // returns true if cached database is restored
    } catch (e) {
        console.error('Errore nel caricamento dello stato da LocalStorage:', e);
        return false;
    }
}

export function clearLocalState() {
    localStorage.removeItem('wc2026_matches');
    localStorage.removeItem('wc2026_knockoutMatches');
    localStorage.removeItem('wc2026_betSlip');
    localStorage.removeItem('wc2026_TEAMS_DB');
    localStorage.removeItem('wc2026_tournamentEvents');
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
