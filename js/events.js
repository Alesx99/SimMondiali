import { state, saveLocalState, exportStateAsJson, importStateFromJson, clearSimulationHistory } from './state.js';
import { 
    recalculateKnockoutProgression, 
    recalculateStandings, 
    simulateMatch, 
    simulateAllGroups, 
    simulateAllKnockouts,
    generateSchedule,
    initializeKnockoutMatches
} from './engine.js';
import { 
    renderMatches, 
    renderBracket, 
    renderStandings,
    renderStatsTab, 
    renderH2HAndStatsBomb, 
    openLineupManager, 
    closeLineupManager, 
    updateModalLineupLists, 
    updateBetSlipUI,
    renderAnalyticsTab,
    openMonteCarlo,
    closeMonteCarlo,
    updateMonteCarloProgress,
    showMonteCarloResults,
    renderConvergenceChart,
    renderSuperAggregator,
    openAbmSimulation
} from './ui.js';
import { runMonteCarlo } from './simulator.js';

// Debounce helper for search performance (reducing CPU/memory usage)
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

export function toggleBet(matchId, choice, odds) {
    const existingBetIndex = state.betSlip.findIndex(b => b.matchId === matchId);
    
    if (existingBetIndex > -1) {
        const existingBet = state.betSlip[existingBetIndex];
        if (existingBet.choice === choice) {
            state.betSlip.splice(existingBetIndex, 1);
        } else {
            existingBet.choice = choice;
            existingBet.odds = odds;
        }
    } else {
        state.betSlip.push({ matchId, choice, odds });
    }

    saveLocalState();
    renderMatches();
    renderBracket();
    updateBetSlipUI();
}

export function removeBetFromSlip(matchId) {
    state.betSlip = state.betSlip.filter(b => b.matchId !== matchId);
    saveLocalState();
    renderMatches();
    renderBracket();
    updateBetSlipUI();
}

export function changePlayerStatus(teamCode, playerName, newStatus) {
    const team = state.TEAMS_DB[teamCode];
    if (!team) return;
    
    const player = team.players.find(p => p.name === playerName);
    if (player) {
        player.status = newStatus;
        saveLocalState();
        updateModalLineupLists();
    }
}

export function addNewPlayerFromForm() {
    if (!state.activeModalMatchId) return;

    const match = state.matches.concat(state.knockoutMatches).find(m => m.id === state.activeModalMatchId);
    const selectedSide = document.getElementById("new-player-team").value;
    const teamCode = selectedSide === "A" ? match.teamA : match.teamB;

    const name = document.getElementById("new-player-name").value.trim();
    const pos = document.getElementById("new-player-pos").value;
    const rating = parseInt(document.getElementById("new-player-rating").value);
    const club = document.getElementById("new-player-club").value.trim() || "Svincolato";
    const goals = parseInt(document.getElementById("new-player-goals").value) || 0;
    const assists = parseInt(document.getElementById("new-player-assists").value) || 0;
    const cards = parseInt(document.getElementById("new-player-cards").value) || 0;

    if (!name) {
        alert("Inserisci il nome del giocatore!");
        return;
    }

    // Add to TEAMS_DB state
    state.TEAMS_DB[teamCode].players.push({
        name: name,
        pos: pos,
        club: club,
        rating: rating,
        goals: goals,
        assists: assists,
        yellowCards: cards,
        status: "starting"
    });

    // Clear form inputs
    document.getElementById("new-player-name").value = "";
    document.getElementById("new-player-rating").value = 80;
    document.getElementById("new-player-club").value = "";
    document.getElementById("new-player-goals").value = 0;
    document.getElementById("new-player-assists").value = 0;
    document.getElementById("new-player-cards").value = 0;

    saveLocalState();
    updateModalLineupLists();
    alert(`Giocatore ${name} aggiunto con successo alle fila del ${state.TEAMS_DB[teamCode].name}!`);
}

// Global event delegation handler to intercept dyn-click items (removes inline onclick attributes)
function handleGlobalClick(e) {
    // Hide bracket popovers if clicked outside
    if (!e.target.closest(".br-toggle-consensus") && !e.target.closest(".bracket-popover")) {
        document.querySelectorAll(".bracket-popover").forEach(p => p.style.display = "none");
    }

    // 1. Check dynamic odd toggles
    const oddBtn = e.target.closest(".odd-btn");
    if (oddBtn) {
        const matchId = parseInt(oddBtn.dataset.matchId);
        const choice = oddBtn.dataset.choice;
        const odds = parseFloat(oddBtn.dataset.odds);
        if (!isNaN(matchId) && choice && !isNaN(odds)) {
            toggleBet(matchId, choice, odds);
        }
        return;
    }

    // 2. Check recommended bracket odds triggers
    const bracketOdds = e.target.closest(".br-add-odds-trigger");
    if (bracketOdds) {
        const matchId = parseInt(bracketOdds.dataset.matchId);
        const choice = bracketOdds.dataset.choice;
        const odds = parseFloat(bracketOdds.dataset.odds);
        if (!isNaN(matchId) && choice && !isNaN(odds)) {
            toggleBet(matchId, choice, odds);
        }
        return;
    }

    // 3. Lineup triggers (matches and brackets)
    const lineupBtn = e.target.closest(".btn-lineup-manage, .br-lineup-trigger");
    if (lineupBtn) {
        const matchId = parseInt(lineupBtn.dataset.matchId);
        if (!isNaN(matchId)) {
            openLineupManager(matchId);
        }
        return;
    }

    // 4. Remove bet triggers
    const removeBetBtn = e.target.closest(".btn-remove-bet");
    if (removeBetBtn) {
        const matchId = parseInt(removeBetBtn.dataset.matchId);
        if (!isNaN(matchId)) {
            removeBetFromSlip(matchId);
        }
        return;
    }

    // 5. Lineup player move status triggers
    const moveBtn = e.target.closest(".move-btn");
    if (moveBtn) {
        const teamCode = moveBtn.dataset.teamCode;
        const playerName = moveBtn.dataset.playerName;
        const status = moveBtn.dataset.status;
        if (teamCode && playerName && status) {
            changePlayerStatus(teamCode, playerName, status);
        }
        return;
    }

    // 6. Single match simulation triggers (group and bracket)
    const simBtn = e.target.closest(".btn-simulate-match, .br-simulate-trigger");
    if (simBtn) {
        const matchId = parseInt(simBtn.dataset.matchId);
        if (!isNaN(matchId)) {
            openAbmSimulation(matchId, () => {
                renderMatches();
                renderBracket();
                renderStandings();
                const activeTab = document.querySelector(".tab-btn.active");
                if (activeTab && activeTab.dataset.tab === "analytics") {
                    renderAnalyticsTab();
                }
            });
        }
        return;
    }

    // 7. Monte Carlo modal trigger
    const openMcBtn = e.target.closest(".btn-open-mc-modal");
    if (openMcBtn) {
        openMonteCarlo();
        return;
    }

    // 8. Toggle consensus details triggers (group matches)
    const toggleConsensusBtn = e.target.closest(".btn-toggle-consensus");
    if (toggleConsensusBtn) {
        const matchId = parseInt(toggleConsensusBtn.dataset.matchId);
        const detailsContainer = document.querySelector(`.match-consensus-details[data-match-id="${matchId}"]`);
        if (detailsContainer) {
            const isVisible = detailsContainer.style.display === "block";
            detailsContainer.style.display = isVisible ? "none" : "block";
            toggleConsensusBtn.innerHTML = isVisible 
                ? `<i class="fa-solid fa-chevron-down"></i> Analisi Multimodello` 
                : `<i class="fa-solid fa-chevron-up"></i> Nascondi Analisi`;
        }
        return;
    }

    // 9. Toggle bracket consensus details popover triggers
    const brConsensusBtn = e.target.closest(".br-toggle-consensus");
    if (brConsensusBtn) {
        const matchId = parseInt(brConsensusBtn.dataset.matchId);
        const popover = brConsensusBtn.closest(".bracket-match-node").querySelector(`.bracket-popover[data-match-id="${matchId}"]`);
        if (popover) {
            const isVisible = popover.style.display === "block";
            document.querySelectorAll(".bracket-popover").forEach(p => p.style.display = "none");
            if (!isVisible) {
                popover.style.display = "block";
            }
        }
        return;
    }
}

export function setupEventListeners() {
    // Standard inputs (change and input handlers)
    document.getElementById("match-search").addEventListener("input", debounce(renderMatches, 250));
    document.getElementById("group-filter").addEventListener("change", renderMatches);
    document.getElementById("date-filter").addEventListener("change", renderMatches);
    
    // H2H Select team change handlers
    const h2hTeamA = document.getElementById("h2h-team-a");
    const h2hTeamB = document.getElementById("h2h-team-b");
    if (h2hTeamA) h2hTeamA.addEventListener("change", renderH2HAndStatsBomb);
    if (h2hTeamB) h2hTeamB.addEventListener("change", renderH2HAndStatsBomb);

    // Tab buttons handler (main navigation)
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            
            const targetTab = btn.dataset.tab;
            document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
            
            const tabContent = document.getElementById(`tab-${targetTab}`);
            if (tabContent) {
                tabContent.classList.add("active");
            }
            
            if (targetTab === "stats") {
                renderStatsTab();
            }
        });
    });

    // Slip and Modals actions
    document.getElementById("slip-stake").addEventListener("input", updateBetSlipUI);
    document.getElementById("btn-close-modal").addEventListener("click", closeLineupManager);
    
    // Monte Carlo simulation modal actions
    document.getElementById("btn-close-mc-modal").addEventListener("click", closeMonteCarlo);
    document.getElementById("btn-close-mc-footer").addEventListener("click", closeMonteCarlo);

    document.getElementById("btn-run-mc").addEventListener("click", () => {
        const btn = document.getElementById("btn-run-mc");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> In corso...`;

        const totalSims = parseInt(document.getElementById("mc-sim-count").value) || 10000;
        const modelSelection = document.getElementById("mc-model-select").value || "consensus";

        runMonteCarlo(
            totalSims,
            modelSelection,
            (done, pct, elapsed, remaining) => {
                updateMonteCarloProgress(done, pct, elapsed, remaining);
            },
            (results) => {
                // Save run results in state.simulationHistory
                const runWinners = {};
                results.consensus.forEach(item => {
                    runWinners[item.name] = parseFloat(item.pctConsensus);
                });

                const runSemis = {};
                if (results.semisConsensus) {
                    results.semisConsensus.forEach(item => {
                        runSemis[item.name] = parseFloat(item.pctConsensus);
                    });
                }

                const historyRecord = {
                    id: "sim_" + Date.now() + "_" + Math.floor(Math.random()*1000),
                    timestamp: Date.now(),
                    model: results.modelSelection,
                    iterations: results.total,
                    winners: runWinners,
                    semis: runSemis
                };
                
                state.simulationHistory.push(historyRecord);
                saveLocalState();

                showMonteCarloResults(results);
                renderSuperAggregator();
                renderConvergenceChart();
            }
        );
    });

    const clearSimHistBtn = document.getElementById("btn-clear-sim-history");
    if (clearSimHistBtn) {
        clearSimHistBtn.addEventListener("click", () => {
            if (confirm("Sei sicuro di voler cancellare tutto lo storico delle simulazioni massive?")) {
                clearSimulationHistory();
                renderSuperAggregator();
                renderConvergenceChart();
            }
        });
    }
    
    document.getElementById("btn-save-lineup").addEventListener("click", () => {
        closeLineupManager();
        renderMatches();
        renderBracket();
        updateBetSlipUI();
    });

    document.getElementById("btn-clear-slip").addEventListener("click", () => {
        state.betSlip = [];
        saveLocalState();
        renderMatches();
        renderBracket();
        updateBetSlipUI();
    });

    document.getElementById("btn-submit-bet").addEventListener("click", () => {
        if (state.betSlip.length === 0) return;
        const mult = document.getElementById("slip-multiplier").textContent;
        const conf = document.getElementById("slip-confidence-badge").textContent;
        alert(`Simulazione salvata! Quota equa combinata: ${mult}. Probabilità combinata di successo: ${conf}.`);
        state.betSlip = [];
        saveLocalState();
        renderMatches();
        renderBracket();
        updateBetSlipUI();
    });

    // Custom form submit for players (modal input)
    document.getElementById("btn-add-player-submit").addEventListener("click", addNewPlayerFromForm);

    // Simulation triggers
    const simGroupsBtn = document.getElementById("btn-simulate-groups");
    if (simGroupsBtn) {
        simGroupsBtn.addEventListener("click", () => {
            simulateAllGroups();
            renderMatches();
            renderStandings();
            renderBracket();
        });
    }

    const simBracketBtn = document.getElementById("btn-simulate-bracket");
    if (simBracketBtn) {
        simBracketBtn.addEventListener("click", () => {
            simulateAllKnockouts();
            renderMatches();
            renderStandings();
            renderBracket();
        });
    }

    const resetBtn = document.getElementById("btn-reset-tournament");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            // Rigenera il calendario e il tabellone da zero per riflettere le nuove date ed algoritmi
            generateSchedule();
            initializeKnockoutMatches();
            state.tournamentEvents = [];
            state.betSlip = [];
            recalculateStandings();
            renderMatches();
            renderStandings();
            renderBracket();
            updateBetSlipUI();
            const activeTab = document.querySelector(".tab-btn.active");
            if (activeTab && activeTab.dataset.tab === "stats") {
                renderStatsTab();
            } else if (activeTab && activeTab.dataset.tab === "analytics") {
                renderAnalyticsTab();
            }
            saveLocalState();
        });
    }

    // Dynamic radio triggers for penalties inside knockout bracket
    document.getElementById("bracket-container").addEventListener("change", (e) => {
        const radio = e.target.closest(".br-pen-radio");
        if (radio) {
            const matchId = parseInt(radio.dataset.matchId);
            const winnerSlot = radio.value;
            const match = state.knockoutMatches.find(m => m.id === matchId);
            if (match) {
                match.penaltiesWinner = winnerSlot;
                recalculateKnockoutProgression();
                renderBracket();
            }
        }
    });

    // Delegated score input listener for Group Matches
    const matchesContainer = document.getElementById("matches-container");
    if (matchesContainer) {
        matchesContainer.addEventListener("input", debounce((e) => {
            const input = e.target;
            if (!input.classList.contains("team-a-score") && !input.classList.contains("team-b-score")) return;
            
            const card = input.closest(".match-card");
            if (!card) return;
            
            const matchId = parseInt(card.dataset.matchId);
            const m = state.matches.find(x => x.id === matchId);
            if (!m) return;
            
            const scoreAInput = card.querySelector(".team-a-score");
            const scoreBInput = card.querySelector(".team-b-score");
            
            const valA = scoreAInput.value;
            const valB = scoreBInput.value;
            
            if (valA !== "" && valB !== "") {
                const parsedA = parseInt(valA);
                const parsedB = parseInt(valB);
                m.scoreA = isNaN(parsedA) || parsedA < 0 ? 0 : Math.min(15, parsedA);
                m.scoreB = isNaN(parsedB) || parsedB < 0 ? 0 : Math.min(15, parsedB);
                scoreAInput.value = m.scoreA;
                scoreBInput.value = m.scoreB;
            } else {
                m.scoreA = null;
                m.scoreB = null;
                state.tournamentEvents = state.tournamentEvents.filter(evt => evt.matchId !== m.id);
            }
            
            recalculateStandings();
            renderStandings();
            renderBracket();
            updateBetSlipUI();
            
            const activeTab = document.querySelector(".tab-btn.active");
            if (activeTab && activeTab.dataset.tab === "analytics") {
                renderAnalyticsTab();
            }
        }, 350));
    }

    // Delegated score input listener for Bracket (Knockout)
    const bracketContainer = document.getElementById("bracket-container");
    if (bracketContainer) {
        bracketContainer.addEventListener("input", debounce((e) => {
            const input = e.target;
            if (!input.classList.contains("team-a-score") && !input.classList.contains("team-b-score")) return;
            
            const node = input.closest(".bracket-match-node");
            if (!node) return;
            
            const matchId = parseInt(node.dataset.matchId);
            const m = state.knockoutMatches.find(x => x.id === matchId);
            if (!m) return;
            
            const scoreAInput = node.querySelector(".team-a-score");
            const scoreBInput = node.querySelector(".team-b-score");
            
            const valA = scoreAInput.value;
            const valB = scoreBInput.value;
            
            if (valA !== "" && valB !== "") {
                const parsedA = parseInt(valA);
                const parsedB = parseInt(valB);
                m.scoreA = isNaN(parsedA) || parsedA < 0 ? 0 : Math.min(15, parsedA);
                m.scoreB = isNaN(parsedB) || parsedB < 0 ? 0 : Math.min(15, parsedB);
                scoreAInput.value = m.scoreA;
                scoreBInput.value = m.scoreB;
                
                if (m.scoreA === m.scoreB && !m.penaltiesWinner) {
                    m.penaltiesWinner = "A";
                }
            } else {
                m.scoreA = null;
                m.scoreB = null;
                m.penaltiesWinner = null;
                state.tournamentEvents = state.tournamentEvents.filter(evt => evt.matchId !== m.id);
            }
            
            recalculateKnockoutProgression();
            renderBracket();
            
            const activeTab = document.querySelector(".tab-btn.active");
            if (activeTab && activeTab.dataset.tab === "analytics") {
                renderAnalyticsTab();
            }
        }, 350));
    }

    // Attach Event Delegation listener to root level
    document.addEventListener("click", handleGlobalClick);

    // Mobile Drawer opening / closing triggers
    const mobileSlipTrigger = document.getElementById("mobile-slip-trigger");
    const mobileCloseSlipBtn = document.getElementById("btn-close-slip");
    const drawer = document.querySelector(".bet-slip-sidebar");

    if (mobileSlipTrigger && drawer) {
        mobileSlipTrigger.addEventListener("click", () => {
            drawer.classList.add("active");
            mobileSlipTrigger.setAttribute("aria-expanded", "true");
        });
    }

    if (mobileCloseSlipBtn && drawer) {
        mobileCloseSlipBtn.addEventListener("click", () => {
            drawer.classList.remove("active");
            if (mobileSlipTrigger) mobileSlipTrigger.setAttribute("aria-expanded", "false");
        });
    }

    // Backup actions (Export & Import)
    const exportBtn = document.getElementById("btn-export-backup");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            exportStateAsJson();
        });
    }

    const importInput = document.getElementById("input-import-backup");
    if (importInput) {
        importInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const success = importStateFromJson(evt.target.result);
                if (success) {
                    alert("Backup caricato con successo! Lo stato della simulazione è stato ripristinato.");
                    recalculateStandings();
                    renderMatches();
                    renderStandings();
                    renderBracket();
                    updateBetSlipUI();
                    const activeTab = document.querySelector(".tab-btn.active");
                    if (activeTab && activeTab.dataset.tab === "stats") {
                        renderStatsTab();
                    } else if (activeTab && activeTab.dataset.tab === "analytics") {
                        renderAnalyticsTab();
                    }
                } else {
                    alert("Errore nell'importazione: il file selezionato non è un backup valido.");
                }
            };
            reader.readAsText(file);
            // Clear input value to allow importing the same file again
            importInput.value = "";
        });
    }
}
