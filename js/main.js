import { state, loadLocalState, saveLocalState } from './state.js';
import { 
    initializeGroups, 
    generateSchedule, 
    recalculateStandings, 
    initializeKnockoutMatches 
} from './engine.js';
import { 
    populateDateFilters, 
    renderMatches, 
    renderStandings, 
    renderBracket, 
    renderAnalyticsTab, 
    updateBetSlipUI 
} from './ui.js';
import { setupEventListeners } from './events.js';

// Safe fetch helper to handle errors individually (Bug 3 Fix)
async function safeFetchJson(url, fallbackValue = {}) {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.warn(`Impossibile caricare il file ${url}. Verrà usato il valore di fallback.`, e);
        return fallbackValue;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Fetch core database
    let fetchedTeams = null;
    try {
        const res = await fetch('/data/teams.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        fetchedTeams = await res.json();
    } catch (e) {
        console.error("Errore critico: impossibile caricare il database teams.json", e);
    }

    // 2. Fetch stats datasets robustly via safe helper
    const [svRes, h2hRes, recRes, sbRes] = await Promise.all([
        safeFetchJson('/data/stats/squad_values.json', {}),
        safeFetchJson('/data/stats/h2h_stats.json', {}),
        safeFetchJson('/data/stats/recurrences.json', { avg_goals_wc: 2.65, knockout_draw_rate: 0.28, exact_scores: [] }),
        safeFetchJson('/data/stats/statsbomb_aggregated.json', {})
    ]);

    state.squadValuesStats = svRes;
    state.h2hStats = h2hRes;
    state.recurrencesStats = recRes;
    state.statsbombStats = sbRes;

    // 3. Load state from LocalStorage cache
    const hasCachedState = loadLocalState();

    if (!hasCachedState) {
        if (fetchedTeams) {
            state.TEAMS_DB = fetchedTeams;
            initializeGroups();
            generateSchedule();
            recalculateStandings();
            initializeKnockoutMatches();
            saveLocalState();
        } else {
            alert("Errore critico: database non caricato. Verifica la connessione.");
            return;
        }
    }

    // 4. Initial rendering
    populateDateFilters();
    renderMatches();
    renderStandings();
    renderBracket();
    renderAnalyticsTab();
    updateBetSlipUI();

    // 5. Setup event delegation listeners
    setupEventListeners();
    
    console.log("Mondiali 2026 Simulator bootstrapped successfully!");
});
