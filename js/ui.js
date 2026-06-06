import { state } from './state.js';
import { CONFIG, GROUP_STAGE_DATES } from './config.js';
import { calculateMatchOdds, getTeamDepartments, simulateMatch } from './engine.js';

// 1. POPOLA FILTRI DATE
export function populateDateFilters() {
    const select = document.getElementById("date-filter");
    if (!select) return;
    select.innerHTML = '<option value="all">Tutti i Giorni</option>';
    GROUP_STAGE_DATES.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });
}

// 2. RENDERING TAB MATCHES (GIRONI)
export function renderMatches() {
    const container = document.getElementById("matches-container");
    if (!container) return;
    container.innerHTML = "";

    const searchVal = document.getElementById("match-search").value.toLowerCase();
    const groupVal = document.getElementById("group-filter").value;
    const dateVal = document.getElementById("date-filter").value;

    const filteredMatches = state.matches.filter(m => {
        const teamA = state.TEAMS_DB[m.teamA];
        const teamB = state.TEAMS_DB[m.teamB];

        const matchGroup = m.group;
        const matchDate = m.date;

        const matchesSearch = teamA.name.toLowerCase().includes(searchVal) || 
                              teamB.name.toLowerCase().includes(searchVal) ||
                              teamA.players.some(p => p.name.toLowerCase().includes(searchVal)) ||
                              teamB.players.some(p => p.name.toLowerCase().includes(searchVal));

        const matchesGroup = groupVal === "all" || matchGroup === groupVal;
        const matchesDate = dateVal === "all" || matchDate === dateVal;

        return matchesSearch && matchesGroup && matchesDate;
    });

    if (filteredMatches.length === 0) {
        container.innerHTML = `
            <div class="empty-slip-msg" style="grid-column: 1/-1; padding: 40px;">
                <i class="fa-solid fa-ban"></i>
                <p>Nessun incontro corrisponde ai criteri di ricerca impostati.</p>
            </div>`;
        return;
    }

    filteredMatches.forEach(m => {
        const teamA = state.TEAMS_DB[m.teamA];
        const teamB = state.TEAMS_DB[m.teamB];
        
        const oddsData = calculateMatchOdds(m.teamA, m.teamB);

        const card = document.createElement("div");
        card.className = "match-card";
        card.dataset.matchId = m.id;

        const bet1 = state.betSlip.find(b => b.matchId === m.id && b.choice === "1") ? "selected" : "";
        const betX = state.betSlip.find(b => b.matchId === m.id && b.choice === "X") ? "selected" : "";
        const bet2 = state.betSlip.find(b => b.matchId === m.id && b.choice === "2") ? "selected" : "";
        const betUnder = state.betSlip.find(b => b.matchId === m.id && b.choice === "U2.5") ? "selected" : "";
        const betOver = state.betSlip.find(b => b.matchId === m.id && b.choice === "O2.5") ? "selected" : "";
        const betGG = state.betSlip.find(b => b.matchId === m.id && b.choice === "GG") ? "selected" : "";
        const betNG = state.betSlip.find(b => b.matchId === m.id && b.choice === "NG") ? "selected" : "";

        // Value Bets detection glows
        const valA = oddsData.valueBets.find(vb => vb.choice === "1");
        const valX = oddsData.valueBets.find(vb => vb.choice === "X");
        const valB = oddsData.valueBets.find(vb => vb.choice === "2");
        const valUnder = oddsData.valueBets.find(vb => vb.choice === "U2.5");
        const valOver = oddsData.valueBets.find(vb => vb.choice === "O2.5");
        const valGG = oddsData.valueBets.find(vb => vb.choice === "GG");
        const valNG = oddsData.valueBets.find(vb => vb.choice === "NG");

        const hasVal1 = valA ? "value-glow" : "";
        const hasValX = valX ? "value-glow" : "";
        const hasVal2 = valB ? "value-glow" : "";
        const hasValUnder = valUnder ? "value-glow" : "";
        const hasValOver = valOver ? "value-glow" : "";
        const hasValGG = valGG ? "value-glow" : "";
        const hasValNG = valNG ? "value-glow" : "";

        // Goalscorer lists
        const matchEvents = state.tournamentEvents ? state.tournamentEvents.filter(evt => evt.matchId === m.id) : [];
        const teamAEvents = matchEvents.filter(evt => evt.team === m.teamA);
        const teamBEvents = matchEvents.filter(evt => evt.team === m.teamB);

        const formatEventsList = (events) => {
            const playerGoals = {};
            events.forEach(evt => {
                const label = evt.scorer + (evt.assister ? ` (A. ${evt.assister.split(' ').pop()})` : '');
                if (!playerGoals[label]) playerGoals[label] = [];
                playerGoals[label].push(`${evt.minute}'`);
            });
            return Object.keys(playerGoals).map(player => `${player} ${playerGoals[player].join(', ')}`).join(', ');
        };

        const scorersHtmlA = formatEventsList(teamAEvents);
        const scorersHtmlB = formatEventsList(teamBEvents);

        // Calculate values dynamically for display explanations and badge classifications before template layout
        const startersA = teamA.players.filter(p => p.status === "starting");
        const startersB = teamB.players.filter(p => p.status === "starting");
        const squadValA = teamA.players.reduce((sum, p) => sum + (p.value || 0), 0) || 50000000;
        const squadValB = teamB.players.reduce((sum, p) => sum + (p.value || 0), 0) || 50000000;
        const valDiffM = Math.abs((squadValA - squadValB) / 1000000).toFixed(0);
        const avgRatingA = startersA.reduce((sum, p) => sum + p.rating, 0) / (startersA.length || 1);
        const avgRatingB = startersB.reduce((sum, p) => sum + p.rating, 0) / (startersB.length || 1);
        const eloA = teamA.baseStrength * 0.4 + avgRatingA * 0.6;
        const eloB = teamB.baseStrength * 0.4 + avgRatingB * 0.6;
        const eloDiff = Math.abs(eloA - eloB).toFixed(0);

        // Agreement classification
        const getHighestOutcome = (model) => {
            if (model.pctA > model.pctB && model.pctA > model.pctX) return "1";
            if (model.pctB > model.pctA && model.pctB > model.pctX) return "2";
            return "X";
        };
        const outPoisson = getHighestOutcome(oddsData.models.poisson);
        const outElo = getHighestOutcome(oddsData.models.elo);
        const outValue = getHighestOutcome(oddsData.models.value);
        
        let consensusTypeClass = "divergente";
        let consensusTypeText = "Divergenza: Nessun accordo tra i modelli statistici";
        
        if (outPoisson === outElo && outPoisson === outValue) {
            consensusTypeClass = "forte";
            const outcomeLabel = outPoisson === "1" ? teamA.name : (outPoisson === "2" ? teamB.name : "Pareggio");
            consensusTypeText = `Consenso Forte: 3/3 concordano su Vittoria ${outcomeLabel}`;
        } else if (outPoisson === outElo || outPoisson === outValue) {
            consensusTypeClass = "parziale";
            const outcomeLabel = outPoisson === "1" ? teamA.name : (outPoisson === "2" ? teamB.name : "Pareggio");
            consensusTypeText = `Consenso Parziale: 2/3 concordano su Vittoria ${outcomeLabel}`;
        } else if (outElo === outValue) {
            consensusTypeClass = "parziale";
            const outcomeLabel = outElo === "1" ? teamA.name : (outElo === "2" ? teamB.name : "Pareggio");
            consensusTypeText = `Consenso Parziale: 2/3 concordano su Vittoria ${outcomeLabel}`;
        }

        card.innerHTML = `
            <div class="match-meta">
                <span><i class="fa-solid fa-clock"></i> ${m.date}</span>
                <span class="xg-indicator">xG: ${oddsData.xgA} - ${oddsData.xgB}</span>
                ${oddsData.hasValueBet ? `
                <span class="value-bet-badge" title="Trovata quota di valore superiore al modello equo!">
                    <i class="fa-solid fa-fire"></i> Valore +${Math.round(oddsData.bestValueBet.ev * 100)}% EV
                </span>` : ''}
                <span class="group-tag">Gruppo ${m.group}</span>
            </div>
            
            <div class="match-teams-score">
                <div class="team-row-display team-a">
                    <span class="team-icon-flag">${teamA.flag}</span>
                    <span class="team-name-label" title="${teamA.name}">${teamA.name}</span>
                </div>
                
                <div class="match-score-inputs">
                    <input type="number" class="score-inp team-a-score" min="0" value="${m.scoreA !== null ? m.scoreA : ''}" placeholder="-">
                    <span class="score-divider">:</span>
                    <input type="number" class="score-inp team-b-score" min="0" value="${m.scoreB !== null ? m.scoreB : ''}" placeholder="-">
                </div>
                
                <div class="team-row-display team-b">
                    <span class="team-name-label" title="${teamB.name}">${teamB.name}</span>
                    <span class="team-icon-flag">${teamB.flag}</span>
                </div>
            </div>

            <!-- Scorers Display -->
            ${m.scoreA !== null && m.scoreB !== null && (scorersHtmlA || scorersHtmlB) ? `
            <div class="match-scorers-display">
                <div class="scorers-list win-a-scorers" title="${scorersHtmlA}">${scorersHtmlA}</div>
                <div></div>
                <div class="scorers-list win-b-scorers" title="${scorersHtmlB}">${scorersHtmlB}</div>
            </div>` : ''}

            <!-- Odds Row (Displaying Bookmaker Odds and EV glows) -->
            <div class="match-betting-odds">
                <div class="odds-row">
                    <button class="odd-btn ${bet1} ${hasVal1}" data-match-id="${m.id}" data-choice="1" data-odds="${oddsData.bookieOddA}">
                        <span>1</span>
                        <span>${oddsData.bookieOddA}</span>
                    </button>
                    <button class="odd-btn ${betX} ${hasValX}" data-match-id="${m.id}" data-choice="X" data-odds="${oddsData.bookieOddX}">
                        <span>X</span>
                        <span>${oddsData.bookieOddX}</span>
                    </button>
                    <button class="odd-btn ${bet2} ${hasVal2}" data-match-id="${m.id}" data-choice="2" data-odds="${oddsData.bookieOddB}">
                        <span>2</span>
                        <span>${oddsData.bookieOddB}</span>
                    </button>
                    <button class="odd-btn ${betUnder} ${hasValUnder}" data-match-id="${m.id}" data-choice="U2.5" data-odds="${oddsData.bookieOddUnder}">
                        <span>U 2.5</span>
                        <span>${oddsData.bookieOddUnder}</span>
                    </button>
                    <button class="odd-btn ${betOver} ${hasValOver}" data-match-id="${m.id}" data-choice="O2.5" data-odds="${oddsData.bookieOddOver}">
                        <span>O 2.5</span>
                        <span>${oddsData.bookieOddOver}</span>
                    </button>
                    <button class="odd-btn ${betGG} ${hasValGG}" data-match-id="${m.id}" data-choice="GG" data-odds="${oddsData.bookieOddGG}">
                        <span>GG</span>
                        <span>${oddsData.bookieOddGG}</span>
                    </button>
                    <button class="odd-btn ${betNG} ${hasValNG}" data-match-id="${m.id}" data-choice="NG" data-odds="${oddsData.bookieOddNG}">
                        <span>NG</span>
                        <span>${oddsData.bookieOddNG}</span>
                    </button>
                </div>
            </div>

            <!-- Real-time percentages -->
            <div class="match-prob-analytics">
                <div class="prob-labels">
                    <span>${teamA.name} ${oddsData.pctA}%</span>
                    <span>Pareggio ${oddsData.pctX}%</span>
                    <span>${teamB.name} ${oddsData.pctB}%</span>
                </div>
                <div class="prob-bars-stack">
                    <div class="prob-bar-segment win-a" style="width: ${oddsData.pctA}%"></div>
                    <div class="prob-bar-segment draw" style="width: ${oddsData.pctX}%"></div>
                    <div class="prob-bar-segment win-b" style="width: ${oddsData.pctB}%"></div>
                </div>
            </div>

            <div class="card-footer-actions">
                <span class="recommended-bet-badge">
                    <i class="fa-solid fa-lightbulb"></i> Consigliato: <strong>${oddsData.recChoice} @ ${oddsData.recOdd}</strong> (Risultato esatto: <strong>${oddsData.recScore}</strong>)
                </span>
                <div class="match-actions-group" style="display: flex; gap: 8px;">
                    <button class="btn-toggle-consensus secondary-btn" data-match-id="${m.id}" style="padding: 6px 12px; font-size: 11px;">
                        <i class="fa-solid fa-chevron-down"></i> Analisi Multimodello
                    </button>
                    <button class="btn-simulate-match secondary-btn" data-match-id="${m.id}" style="padding: 6px 12px; font-size: 11px;">
                        <i class="fa-solid fa-dice"></i> Simula
                    </button>
                    <button class="btn-lineup-manage" data-match-id="${m.id}">
                        <i class="fa-solid fa-users-gear"></i> Gestisci Lineup
                    </button>
                </div>
            </div>

            <!-- Detailed Multi-Model Consensus Collapsible Section -->
            <div class="match-consensus-details" data-match-id="${m.id}">
                <span class="consensus-badge ${consensusTypeClass}">
                    <i class="fa-solid fa-square-poll-vertical"></i> ${consensusTypeText}
                </span>
                <table class="consensus-table">
                    <thead>
                        <tr>
                            <th>Modello Statistico</th>
                            <th>1 (%)</th>
                            <th>X (%)</th>
                            <th>2 (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Poisson (xG & Lineup)</td>
                            <td>${oddsData.models.poisson.pctA}%</td>
                            <td>${oddsData.models.poisson.pctX}%</td>
                            <td>${oddsData.models.poisson.pctB}%</td>
                        </tr>
                        <tr>
                            <td>ELO (Forza Storica)</td>
                            <td>${oddsData.models.elo.pctA}%</td>
                            <td>${oddsData.models.elo.pctX}%</td>
                            <td>${oddsData.models.elo.pctB}%</td>
                        </tr>
                        <tr>
                            <td>Valore (Transfermarkt)</td>
                            <td>${oddsData.models.value.pctA}%</td>
                            <td>${oddsData.models.value.pctX}%</td>
                            <td>${oddsData.models.value.pctB}%</td>
                        </tr>
                        <tr class="consensus-row">
                            <td>Consenso Blended (Ensemble)</td>
                            <td>${oddsData.models.consensus.pctA}%</td>
                            <td>${oddsData.models.consensus.pctX}%</td>
                            <td>${oddsData.models.consensus.pctB}%</td>
                        </tr>
                    </tbody>
                </table>
                <div style="font-size: 10px; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border-color); padding-top: 6px; margin-top: 6px;">
                    <i class="fa-solid fa-circle-info"></i> ${squadValA > squadValB ? teamA.name : teamB.name} ha un valore rosa superiore di <strong>${valDiffM}M &euro;</strong>. ${eloA > eloB ? teamA.name : teamB.name} ha un rendimento ELO superiore di <strong>${eloDiff} pt</strong>.
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// 3. RENDERING CLASSIFICHE LIVE
export function renderStandings() {
    const container = document.getElementById("groups-container");
    if (!container) return;
    container.innerHTML = "";

    Object.keys(state.standings).forEach(grp => {
        const card = document.createElement("div");
        card.className = "group-card";
        
        let tableRowsHtml = "";
        state.standings[grp].forEach((team, idx) => {
            const teamDetails = state.TEAMS_DB[team.code];
            
            let rowClass = "";
            if (idx < 2) rowClass = "qualify-direct";
            else if (idx === 2) rowClass = "qualify-third";

            tableRowsHtml += `
                <tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>
                        <div class="grp-team-name">
                            <span class="grp-team-flag">${teamDetails.flag}</span>
                            <span title="${teamDetails.name}">${teamDetails.name}</span>
                        </div>
                    </td>
                    <td>${team.played}</td>
                    <td><strong>${team.pts}</strong></td>
                    <td>${team.gf}:${team.gs}</td>
                    <td>${team.gd > 0 ? '+' + team.gd : team.gd}</td>
                    <td class="stat-highlight" style="color: var(--accent-red); font-size: 10px;">${team.fairplay}</td>
                </tr>
            `;
        });

        card.innerHTML = `
            <h3>Gruppo ${grp}</h3>
            <table class="group-table">
                <thead>
                    <tr>
                        <th style="width: 25px;">#</th>
                        <th>Squadra</th>
                        <th style="width: 30px;">G</th>
                        <th style="width: 30px;">Pt</th>
                        <th style="width: 45px;">Reti</th>
                        <th style="width: 30px;">DR</th>
                        <th style="width: 30px;" title="Fair Play (Malus Cartellini)"><i class="fa-solid fa-triangle-exclamation"></i></th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
        `;
        container.appendChild(card);
    });
}

// 4. RENDERING ALBERO DEL TABELLONE (KNOCKOUT GRAPHIC TREE)
export function renderBracket() {
    const container = document.getElementById("bracket-container");
    if (!container) return;

    const rounds = [
        { code: "32", label: "Sedicesimi (Round of 32)" },
        { code: "16", label: "Ottavi" },
        { code: "8", label: "Quarti" },
        { code: "4", label: "Semifinale" },
        { code: "2", label: "Finale" }
    ];

    // Preserve overall active element info
    let activeMatchId = null;
    let activeFieldType = null;
    let activeSelectionStart = null;
    let activeSelectionEnd = null;
    const activeEl = document.activeElement;
    if (activeEl && container.contains(activeEl)) {
        const node = activeEl.closest(".bracket-match-node");
        if (node) {
            activeMatchId = parseInt(node.dataset.matchId);
            if (activeEl.classList.contains("team-a-score")) {
                activeFieldType = "score-a";
            } else if (activeEl.classList.contains("team-b-score")) {
                activeFieldType = "score-b";
            } else if (activeEl.classList.contains("br-pen-radio")) {
                activeFieldType = activeEl.value === "A" ? "pen-a" : "pen-b";
            }
            if (activeEl.tagName === "INPUT") {
                try {
                    activeSelectionStart = activeEl.selectionStart;
                    activeSelectionEnd = activeEl.selectionEnd;
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    rounds.forEach((rnd) => {
        let col = container.querySelector(`.bracket-round-column.round-${rnd.code}`);
        if (!col) {
            col = document.createElement("div");
            col.className = `bracket-round-column round-${rnd.code}`;
            
            const header = document.createElement("div");
            header.className = "bracket-round-header";
            header.textContent = rnd.label;
            col.appendChild(header);
            
            container.appendChild(col);
        }

        const roundMatches = state.knockoutMatches.filter(m => m.round === rnd.code);
        
        roundMatches.forEach((m) => {
            let node = col.querySelector(`.bracket-match-node[data-match-id="${m.id}"]`);
            if (!node) {
                node = document.createElement("div");
                node.dataset.matchId = m.id;
                col.appendChild(node);
            }

            // Build state signature to check if we need to update
            const teamA = m.teamA ? state.TEAMS_DB[m.teamA] : null;
            const teamB = m.teamB ? state.TEAMS_DB[m.teamB] : null;
            const matchStateObj = {
                teamA: teamA ? teamA.code : "",
                teamB: teamB ? teamB.code : "",
                scoreA: m.scoreA,
                scoreB: m.scoreB,
                penaltiesWinner: m.penaltiesWinner
            };
            const matchStateStr = JSON.stringify(matchStateObj);

            if (node.dataset.renderedState === matchStateStr) {
                // No changes, skip innerHTML update
                return;
            }

            // Update node
            if (!m.teamA && !m.teamB) {
                node.className = "bracket-match-node empty";
                node.innerHTML = `<div style="text-align: center; font-size: 10px; color: var(--text-muted);">In attesa dei gironi...</div>`;
            } else {
                node.className = "bracket-match-node";
                
                const displayTeamA = teamA || { name: "TBD", flag: "🏳️", code: "" };
                const displayTeamB = teamB || { name: "TBD", flag: "🏳️", code: "" };

                let oddsHtml = "";
                let popoverHtml = "";
                if (m.teamA && m.teamB) {
                    const oddsData = calculateMatchOdds(m.teamA, m.teamB);
                    let bookieRecOdd = oddsData.recOdd;
                    if (oddsData.recChoice === "1") bookieRecOdd = oddsData.bookieOddA;
                    else if (oddsData.recChoice === "X") bookieRecOdd = oddsData.bookieOddX;
                    else if (oddsData.recChoice === "2") bookieRecOdd = oddsData.bookieOddB;
                    else if (oddsData.recChoice === "U2.5") bookieRecOdd = oddsData.bookieOddUnder;
                    else if (oddsData.recChoice === "O2.5") bookieRecOdd = oddsData.bookieOddOver;
                    else if (oddsData.recChoice === "GG") bookieRecOdd = oddsData.bookieOddGG;
                    else if (oddsData.recChoice === "NG") bookieRecOdd = oddsData.bookieOddNG;

                    oddsHtml = `
                        <div class="br-node-footer">
                            <span class="br-rec-odd">Consigliato: <strong>${oddsData.recChoice}</strong> (Score: <strong>${oddsData.recScore}</strong>)</span>
                            <span class="stat-highlight br-add-odds-trigger" style="font-size: 9px; cursor: pointer; color: var(--accent-blue);" data-match-id="${m.id}" data-choice="${oddsData.recChoice}" data-odds="${bookieRecOdd}">
                                Quota: ${bookieRecOdd} <i class="fa-solid fa-cart-plus"></i>
                            </span>
                        </div>
                    `;

                    popoverHtml = `
                        <div class="bracket-popover" data-match-id="${m.id}">
                            <div class="bracket-popover-arrow"></div>
                            <h4><i class="fa-solid fa-square-poll-vertical"></i> Consenso Multimodello</h4>
                            <table class="consensus-table" style="margin-bottom: 0;">
                                <thead>
                                    <tr>
                                        <th>Modello</th>
                                        <th>1 (%)</th>
                                        <th>X (%)</th>
                                        <th>2 (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Poisson</td>
                                        <td>${oddsData.models.poisson.pctA}</td>
                                        <td>${oddsData.models.poisson.pctX}</td>
                                        <td>${oddsData.models.poisson.pctB}</td>
                                    </tr>
                                    <tr>
                                        <td>ELO</td>
                                        <td>${oddsData.models.elo.pctA}</td>
                                        <td>${oddsData.models.elo.pctX}</td>
                                        <td>${oddsData.models.elo.pctB}</td>
                                    </tr>
                                    <tr>
                                        <td>Valore</td>
                                        <td>${oddsData.models.value.pctA}</td>
                                        <td>${oddsData.models.value.pctX}</td>
                                        <td>${oddsData.models.value.pctB}</td>
                                    </tr>
                                    <tr class="consensus-row">
                                        <td>Consenso</td>
                                        <td>${oddsData.models.consensus.pctA}</td>
                                        <td>${oddsData.models.consensus.pctX}</td>
                                        <td>${oddsData.models.consensus.pctB}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    `;
                }

                let teamAClass = "";
                let teamBClass = "";
                if (m.scoreA !== null && m.scoreB !== null) {
                    if (m.scoreA > m.scoreB || (m.scoreA === m.scoreB && m.penaltiesWinner === "A")) {
                        teamAClass = "winner";
                    } else if (m.scoreB > m.scoreA || (m.scoreA === m.scoreB && m.penaltiesWinner === "B")) {
                        teamBClass = "winner";
                    }
                }

                const matchEvents = state.tournamentEvents ? state.tournamentEvents.filter(evt => evt.matchId === m.id) : [];
                const teamAEvents = matchEvents.filter(evt => evt.team === m.teamA);
                const teamBEvents = matchEvents.filter(evt => evt.team === m.teamB);

                const getNames = (events) => events.map(e => e.scorer.split(' ').pop()).slice(0, 3).join(', ');
                const scNamesA = getNames(teamAEvents);
                const scNamesB = getNames(teamBEvents);

                node.innerHTML = `
                    <div class="br-match-meta" style="display: flex; justify-content: space-between;">
                        <span>Gara #${m.matchNumber}</span>
                        ${m.teamA && m.teamB ? `
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span class="br-toggle-consensus" style="cursor:pointer; color: var(--accent-emerald);" data-match-id="${m.id}" title="Analisi Multimodello"><i class="fa-solid fa-square-poll-vertical"></i></span>
                            <span class="br-simulate-trigger" style="cursor:pointer; color: var(--accent-color);" data-match-id="${m.id}"><i class="fa-solid fa-dice"></i> Simula</span>
                            <span class="br-lineup-trigger" style="cursor:pointer;" data-match-id="${m.id}"><i class="fa-solid fa-users-gear"></i> Lineup</span>
                        </div>
                        ` : ""}
                    </div>
                    
                    <div class="br-team-row ${teamAClass}">
                        <div class="br-team-info">
                            <span>${displayTeamA.flag}</span>
                            <span title="${displayTeamA.name}">${displayTeamA.name}</span>
                            ${scNamesA ? `<small class="br-scorers-small" style="display:block; font-size: 8px; color: var(--text-muted);">${scNamesA}</small>` : ''}
                        </div>
                        <div class="br-score-inputs">
                            <input type="number" class="br-score-inp team-a-score" min="0" value="${m.scoreA !== null ? m.scoreA : ''}" ${!m.teamA || !m.teamB ? 'disabled' : ''}>
                        </div>
                    </div>

                    ${m.scoreA !== null && m.scoreB !== null && m.scoreA === m.scoreB ? `
                        <div class="penalty-checkbox-wrapper">
                            <span>Rigori vinti da:</span>
                            <label>
                                <input type="radio" class="br-pen-radio" name="pen-${m.id}" value="A" ${m.penaltiesWinner === 'A' ? 'checked' : ''} data-match-id="${m.id}"> A
                            </label>
                            <label>
                                <input type="radio" class="br-pen-radio" name="pen-${m.id}" value="B" ${m.penaltiesWinner === 'B' ? 'checked' : ''} data-match-id="${m.id}"> B
                            </label>
                        </div>
                    ` : ""}

                    <div class="br-team-row ${teamBClass}">
                        <div class="br-team-info">
                            <span>${displayTeamB.flag}</span>
                            <span title="${displayTeamB.name}">${displayTeamB.name}</span>
                            ${scNamesB ? `<small class="br-scorers-small" style="display:block; font-size: 8px; color: var(--text-muted);">${scNamesB}</small>` : ''}
                        </div>
                        <div class="br-score-inputs">
                            <input type="number" class="br-score-inp team-b-score" min="0" value="${m.scoreB !== null ? m.scoreB : ''}" ${!m.teamA || !m.teamB ? 'disabled' : ''}>
                        </div>
                    </div>
                    
                    ${oddsHtml}
                    ${popoverHtml}
                `;
            }

            node.dataset.renderedState = matchStateStr;
        });
    });

    // Restore focus if needed
    if (activeMatchId !== null && activeFieldType !== null) {
        const targetNode = container.querySelector(`.bracket-match-node[data-match-id="${activeMatchId}"]`);
        if (targetNode) {
            let targetEl = null;
            if (activeFieldType === "score-a") {
                targetEl = targetNode.querySelector(".team-a-score");
            } else if (activeFieldType === "score-b") {
                targetEl = targetNode.querySelector(".team-b-score");
            } else if (activeFieldType === "pen-a") {
                targetEl = targetNode.querySelector('.br-pen-radio[value="A"]');
            } else if (activeFieldType === "pen-b") {
                targetEl = targetNode.querySelector('.br-pen-radio[value="B"]');
            }
            if (targetEl) {
                targetEl.focus();
                if (activeSelectionStart !== null && activeSelectionEnd !== null) {
                    try {
                        targetEl.setSelectionRange(activeSelectionStart, activeSelectionEnd);
                    } catch (e) {
                        // ignore
                    }
                }
            }
        }
    }
}

// 5. RENDERING TAB ANALYTICS & INFORTUNI
export function renderAnalyticsTab() {
    const starsBody = document.getElementById("stars-table-body");
    if (!starsBody) return;
    starsBody.innerHTML = "";
    
    const starPlayersData = [
        { name: "Harry Kane", country: "Inghilterra", goals: 36, assist: 5, shots: 89, mins: 2900, rating: 8.22 },
        { name: "Lionel Messi", country: "Argentina", goals: 12, assist: 8, shots: 84, mins: 1243, rating: 8.47 },
        { name: "Kylian Mbappé", country: "Francia", goals: 25, assist: 5, shots: 146, mins: 2599, rating: 8.02 },
        { name: "Erling Haaland", country: "Norvegia", goals: 27, assist: 8, shots: 126, mins: 2958, rating: 7.68 },
        { name: "Cristiano Ronaldo", country: "Portogallo", goals: 28, assist: 2, shots: 161, mins: 2610, rating: 7.88 },
        { name: "Lamine Yamal", country: "Spagna", goals: 16, assist: 11, shots: 117, mins: 2262, rating: 7.88 },
        { name: "Vinícius Júnior", country: "Brasile", goals: 16, assist: 5, shots: 75, mins: 2825, rating: 7.65 },
        { name: "Jude Bellingham", country: "Inghilterra", goals: 6, assist: 4, shots: 51, mins: 1917, rating: 7.53 }
    ];

    starPlayersData.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="player-highlight">${p.name}</td>
            <td>${p.country}</td>
            <td class="stat-highlight">${p.goals}</td>
            <td>${p.assist}</td>
            <td>${p.shots}</td>
            <td>${p.mins}</td>
            <td><span class="badge high">${p.rating.toFixed(2)}</span></td>
        `;
        starsBody.appendChild(tr);
    });

    const injuriesBody = document.getElementById("injuries-table-body");
    if (!injuriesBody) return;
    injuriesBody.innerHTML = "";

    const clinicalInjuries = [
        { name: "Marcelo Flores", country: "Canada (Tigres)", type: "Rottura legamento crociato anteriore", state: "Escluso dal torneo", badgeClass: "danger" },
        { name: "Alphonso Davies", country: "Canada (Bayern Monaco)", type: "Lesione muscolare flessori coscia", state: "In forte dubbio gara 1", badgeClass: "warning" },
        { name: "Moïse Bombito", country: "Canada (Nizza)", type: "Postumi frattura della tibia", state: "Disponibile (in recupero)", badgeClass: "success" },
        { name: "Richie Laryea", country: "Canada (Toronto FC)", type: "Recupero infortunio coscia", state: "Disponibile a minutaggio controllato", badgeClass: "success" },
        { name: "Ali Ahmed", country: "Canada (Vancouver)", type: "Risoluzione infortunio muscolare", state: "Assente amichevoli", badgeClass: "warning" },
        { name: "Jacob Shaffelburg", country: "Canada (Nashville)", type: "Risoluzione infortunio muscolare", state: "Assente amichevoli", badgeClass: "warning" }
    ];

    clinicalInjuries.forEach(i => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="player-highlight">${i.name}</td>
            <td>${i.country}</td>
            <td>${i.type}</td>
            <td><span class="injury-status-badge ${i.badgeClass}">${i.state}</span></td>
        `;
        injuriesBody.appendChild(tr);
    });

    // Rerender simulated top scorers leaderboard
    renderScorersLeaderboard();
}

// 6. RENDERING TAB STATISTICHE ED ARCHIVIO STORICO
let statsTabInitialized = false;

export function renderStatsTab() {
    const selectA = document.getElementById("h2h-team-a");
    const selectB = document.getElementById("h2h-team-b");
    
    if (!selectA || !selectB) return;

    if (!statsTabInitialized) {
        const teamNames = Object.keys(state.TEAMS_DB).map(code => ({
            code: code,
            name: state.TEAMS_DB[code].name
        })).sort((x, y) => x.name.localeCompare(y.name));

        selectA.innerHTML = "";
        selectB.innerHTML = "";

        teamNames.forEach(t => {
            const optA = document.createElement("option");
            optA.value = t.name;
            optA.textContent = t.name;
            selectA.appendChild(optA);

            const optB = document.createElement("option");
            optB.value = t.name;
            optB.textContent = t.name;
            selectB.appendChild(optB);
        });

        // Set defaults
        selectA.value = "Brasile";
        selectB.value = "Argentina";

        statsTabInitialized = true;
    }

    const recAvgGoals = document.getElementById("rec-avg-goals");
    const recDrawRate = document.getElementById("rec-draw-rate");
    const recScoresBody = document.getElementById("rec-scores-body");

    if (recAvgGoals && state.recurrencesStats.avg_goals_wc) {
        recAvgGoals.textContent = state.recurrencesStats.avg_goals_wc;
    }
    if (recDrawRate && state.recurrencesStats.knockout_draw_rate) {
        recDrawRate.textContent = `${(state.recurrencesStats.knockout_draw_rate * 100).toFixed(1)}%`;
    }
    if (recScoresBody && state.recurrencesStats.exact_scores) {
        recScoresBody.innerHTML = "";
        state.recurrencesStats.exact_scores.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="stat-highlight">${row.score}</td>
                <td>${row.count} match</td>
                <td><span class="badge medium">${row.pct}%</span></td>
            `;
            recScoresBody.appendChild(tr);
        });
    }

    const squadChart = document.getElementById("squad-values-chart");
    if (squadChart && state.squadValuesStats) {
        squadChart.innerHTML = "";
        
        const sortedSquads = Object.keys(state.squadValuesStats).map(name => ({
            name: name,
            code: state.squadValuesStats[name].code,
            total_value: state.squadValuesStats[name].total_value,
            avg_age: state.squadValuesStats[name].avg_age,
            top_players: state.squadValuesStats[name].top_players
        })).sort((x, y) => y.total_value - x.total_value);

        const maxValue = sortedSquads[0]?.total_value || 1;

        sortedSquads.forEach(s => {
            const team = state.TEAMS_DB[s.code];
            const flag = team ? team.flag : "🏳️";
            const valM = s.total_value / 1000000;
            const pct = (s.total_value / maxValue) * 100;
            
            const item = document.createElement("div");
            item.className = "squad-value-item";
            item.innerHTML = `
                <div class="squad-value-meta">
                    <span class="squad-value-team">${flag} ${s.name}</span>
                    <span class="squad-value-amount">€${valM.toFixed(1)}M <small>(età media: ${s.avg_age})</small></span>
                </div>
                <div class="squad-value-bar-container" title="Top Players: ${s.top_players.map(tp => tp.name).join(', ')}">
                    <div class="squad-value-bar" style="width: ${pct}%"></div>
                </div>
            `;
            squadChart.appendChild(item);
        });
    }

    renderH2HAndStatsBomb();
}

export function renderH2HAndStatsBomb() {
    const selectA = document.getElementById("h2h-team-a");
    const selectB = document.getElementById("h2h-team-b");
    const h2hArea = document.getElementById("h2h-results-area");
    const sbArea = document.getElementById("statsbomb-data-area");

    if (!selectA || !selectB || !h2hArea || !sbArea) return;

    const teamAName = selectA.value;
    const teamBName = selectB.value;

    if (teamAName === teamBName) {
        h2hArea.innerHTML = `
            <div class="h2h-empty-msg">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Seleziona due squadre diverse per confrontarne lo storico.</p>
            </div>
        `;
        sbArea.innerHTML = "";
        return;
    }

    // Historical H2H
    let record = null;
    if (state.h2hStats && state.h2hStats[teamAName] && state.h2hStats[teamAName][teamBName]) {
        record = state.h2hStats[teamAName][teamBName];
    }

    if (record && record.played > 0) {
        const pctWinA = ((record.win / record.played) * 100).toFixed(1);
        const pctDraw = ((record.draw / record.played) * 100).toFixed(1);
        const pctWinB = ((record.loss / record.played) * 100).toFixed(1);

        let timelineHtml = "";
        record.matches.forEach(m => {
            // Array structure: [date, tournament, score, is_t1_home, shootout_winner_code]
            let shootoutInfo = "";
            if (m[4] === 1) {
                shootoutInfo = ` <span class="badge medium">Rigori vinti da: ${teamAName}</span>`;
            } else if (m[4] === 2) {
                shootoutInfo = ` <span class="badge medium">Rigori vinti da: ${teamBName}</span>`;
            }

            // Score is already formatted from teamAName (t1) perspective: score_t1 - score_t2
            let displayScore = m[2];

            timelineHtml += `
                <div class="timeline-row">
                    <span class="timeline-date">${m[0]}</span>
                    <span class="timeline-tour">${m[1]}</span>
                    <span class="timeline-score stat-highlight">${displayScore}</span>
                    ${shootoutInfo}
                </div>
            `;
        });

        h2hArea.innerHTML = `
            <div class="h2h-summary-numbers">
                <div class="h2h-stat-box">
                    <span class="num">${record.played}</span>
                    <span class="lbl">Incontri Totali</span>
                </div>
                <div class="h2h-ratio-indicator">
                    <div class="ratio-label">Rapporto Vittorie / Pareggi</div>
                    <div class="h2h-bar-ratio">
                        <div class="ratio-segment segment-win-a" style="width: ${pctWinA}%;" title="Vittorie ${teamAName}: ${pctWinA}%"></div>
                        <div class="ratio-segment segment-draw" style="width: ${pctDraw}%;" title="Pareggi: ${pctDraw}%"></div>
                        <div class="ratio-segment segment-win-b" style="width: ${pctWinB}%;" title="Vittorie ${teamBName}: ${pctWinB}%"></div>
                    </div>
                    <div class="ratio-percentages">
                        <span>${teamAName}: ${pctWinA}%</span>
                        <span>Pareggi: ${pctDraw}%</span>
                        <span>${teamBName}: ${pctWinB}%</span>
                    </div>
                </div>
            </div>

            <div class="h2h-goals-box">
                <div class="h2h-goals-sub">
                    <strong>${record.gf} gol</strong> segnati da ${teamAName}
                </div>
                <div class="h2h-goals-divider">|</div>
                <div class="h2h-goals-sub">
                    <strong>${record.ga} gol</strong> segnati da ${teamBName}
                </div>
            </div>

            <div class="h2h-timeline">
                <h4><i class="fa-solid fa-clock-rotate-left"></i> Cronologia Ultimi Scontri Diretti</h4>
                <div class="timeline-list">${timelineHtml}</div>
            </div>
        `;
    } else {
        h2hArea.innerHTML = `
            <div class="h2h-empty-msg">
                <i class="fa-solid fa-circle-info"></i>
                <p>Nessun incontro diretto ufficiale registrato in archivio per questa coppia di nazioni.</p>
            </div>
        `;
    }

    // StatsBomb Compare
    const sbA = state.statsbombStats ? state.statsbombStats[teamAName] : null;
    const sbB = state.statsbombStats ? state.statsbombStats[teamBName] : null;

    if (sbA && sbB) {
        const renderCompareRow = (label, valA, valB) => {
            const numericA = parseFloat(valA);
            const numericB = parseFloat(valB);
            const total = numericA + numericB;
            const pctA = total > 0 ? (numericA / total) * 100 : 50;
            const pctB = 100 - pctA;
            
            const isWinnerA = numericA > numericB;
            const isWinnerB = numericB > numericA;
            
            return `
                <div class="sb-compare-row">
                    <div class="sb-lbl-row">${label}</div>
                    <div class="sb-value-wrapper">
                        <span class="sb-team-val ${isWinnerA ? 'sb-winner' : ''}">${valA}</span>
                        <div class="sb-dual-bar">
                            <div class="sb-bar-half sb-bar-a" style="width: ${pctA}%;"></div>
                            <div class="sb-bar-half sb-bar-b" style="width: ${pctB}%;"></div>
                        </div>
                        <span class="sb-team-val ${isWinnerB ? 'sb-winner' : ''}">${valB}</span>
                    </div>
                </div>
            `;
        };

        const badgeA = sbA.is_estimate ? `<span class="badge low">Stima</span>` : `<span class="badge high">Dati SB</span>`;
        const badgeB = sbB.is_estimate ? `<span class="badge low">Stima</span>` : `<span class="badge high">Dati SB</span>`;

        sbArea.innerHTML = `
            <div class="sb-compare-header">
                <div class="sb-header-team">
                    <strong>${teamAName}</strong>
                    ${badgeA}
                </div>
                <div class="sb-vs">VS</div>
                <div class="sb-header-team">
                    <strong>${teamBName}</strong>
                    ${badgeB}
                </div>
            </div>
            
            <div class="sb-compare-list">
                ${renderCompareRow("Possesso Palla Medio (%)", `${sbA.possession}%`, `${sbB.possession}%`)}
                ${renderCompareRow("Precisione Passaggi (%)", `${sbA.pass_accuracy}%`, `${sbB.pass_accuracy}%`)}
                ${renderCompareRow("Tiri Medi per Partita", sbA.shots, sbB.shots)}
                ${renderCompareRow("Tiri in Porta Medi", sbA.shots_on_target, sbB.shots_on_target)}
                ${renderCompareRow("Expected Goals (xG) Medi", sbA.xg.toFixed(2), sbB.xg.toFixed(2))}
                ${renderCompareRow("Falli Commessi Medi", sbA.fouls, sbB.fouls)}
            </div>
        `;
    } else {
        sbArea.innerHTML = `<p class="empty-msg">Nessun dato StatsBomb disponibile per questa selezione.</p>`;
    }

    // Render interactive H2H SVG radar chart
    drawRadarChart("h2h-radar-container", teamAName, teamBName);
}

// 7. LINEUP MANAGER MODAL
export function openLineupManager(matchId) {
    const match = state.matches.concat(state.knockoutMatches).find(m => m.id === matchId);
    if (!match) return;

    state.activeModalMatchId = matchId;
    
    const teamA = state.TEAMS_DB[match.teamA];
    const teamB = state.TEAMS_DB[match.teamB];

    document.getElementById("modal-match-details").innerHTML = 
        `<i class="fa-solid fa-circle-info"></i> Incontro: ${teamA.flag} ${teamA.name} vs ${teamB.flag} ${teamB.name} | Data: ${match.date}`;

    // Popola selezione del form di inserimento giocatori
    const optA = document.getElementById("opt-team-a");
    const optB = document.getElementById("opt-team-b");
    optA.value = "A";
    optA.textContent = teamA.name;
    optB.value = "B";
    optB.textContent = teamB.name;

    document.getElementById("gauge-team-a-name").textContent = teamA.name;
    document.getElementById("gauge-team-b-name").textContent = teamB.name;
    
    document.getElementById("team-a-header-title").textContent = `Giocatori ${teamA.name}`;
    document.getElementById("team-b-header-title").textContent = `Giocatori ${teamB.name}`;

    updateModalLineupLists();
    
    const modal = document.getElementById("lineup-modal");
    modal.classList.add("active");
    
    // Accessibility: Set focus trapping inside the modal
    modal.setAttribute("aria-hidden", "false");
    const closeBtn = document.getElementById("btn-close-modal");
    if (closeBtn) closeBtn.focus();
}

export function closeLineupManager() {
    const modal = document.getElementById("lineup-modal");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
    state.activeModalMatchId = null;
}

export function updateModalLineupLists() {
    if (!state.activeModalMatchId) return;

    const match = state.matches.concat(state.knockoutMatches).find(m => m.id === state.activeModalMatchId);
    const teamA = state.TEAMS_DB[match.teamA];
    const teamB = state.TEAMS_DB[match.teamB];

    const depsA = getTeamDepartments(match.teamA);
    const depsB = getTeamDepartments(match.teamB);

    // Dynamic gauges update
    document.getElementById("team-a-att-val").textContent = depsA.att;
    document.getElementById("team-a-mid-val").textContent = depsA.mid;
    document.getElementById("team-a-def-val").textContent = depsA.def;
    document.getElementById("team-a-att-bar").style.width = `${depsA.att}%`;
    document.getElementById("team-a-mid-bar").style.width = `${depsA.mid}%`;
    document.getElementById("team-a-def-bar").style.width = `${depsA.def}%`;

    document.getElementById("team-b-att-val").textContent = depsB.att;
    document.getElementById("team-b-mid-val").textContent = depsB.mid;
    document.getElementById("team-b-def-val").textContent = depsB.def;
    document.getElementById("team-b-att-bar").style.width = `${depsB.att}%`;
    document.getElementById("team-b-mid-bar").style.width = `${depsB.mid}%`;
    document.getElementById("team-b-def-bar").style.width = `${depsB.def}%`;

    const lists = {
        "a-starting": document.getElementById("list-a-starting"),
        "a-bench": document.getElementById("list-a-bench"),
        "a-absent": document.getElementById("list-a-absent"),
        "b-starting": document.getElementById("list-b-starting"),
        "b-bench": document.getElementById("list-b-bench"),
        "b-absent": document.getElementById("list-b-absent")
    };
    
    Object.keys(lists).forEach(key => { if (lists[key]) lists[key].innerHTML = ""; });

    const counts = {
        "a-starting": 0, "a-bench": 0, "a-absent": 0,
        "b-starting": 0, "b-bench": 0, "b-absent": 0
    };

    const sortRoleOrder = { "P": 1, "D": 2, "C": 3, "A": 4 };
    const sortPlayers = (list) => [...list].sort((x, y) => sortRoleOrder[x.pos] - sortRoleOrder[y.pos]);

    sortPlayers(teamA.players).forEach(p => {
        const key = `a-${p.status}`;
        counts[key]++;
        if (lists[key]) lists[key].appendChild(createPlayerModalRow(p, match.teamA));
    });

    sortPlayers(teamB.players).forEach(p => {
        const key = `b-${p.status}`;
        counts[key]++;
        if (lists[key]) lists[key].appendChild(createPlayerModalRow(p, match.teamB));
    });

    document.getElementById("count-a-starting").textContent = counts["a-starting"];
    document.getElementById("count-a-bench").textContent = counts["a-bench"];
    document.getElementById("count-a-absent").textContent = counts["a-absent"];
    document.getElementById("count-b-starting").textContent = counts["b-starting"];
    document.getElementById("count-b-bench").textContent = counts["b-bench"];
    document.getElementById("count-b-absent").textContent = counts["b-absent"];
}

export function createPlayerModalRow(player, teamCode) {
    const row = document.createElement("div");
    row.className = "player-item-row";
    
    let valStr = "";
    if (player.value) {
        if (player.value >= 1e6) valStr = `Valore: €${(player.value/1e6).toFixed(1)}M`;
        else valStr = `Valore: €${(player.value/1e3).toFixed(0)}K`;
    }
    
    // Added data-* tags to replace inline click actions
    row.innerHTML = `
        <div class="player-info-meta">
            <span class="player-name-modal">${player.name} (${player.pos})</span>
            <span class="player-club-modal">${player.club}</span>
            <span class="player-stats-inline">
                ${player.goals > 0 ? `Gol: ${player.goals} ` : ""}
                ${player.assists > 0 ? `Ass: ${player.assists} ` : ""}
                ${player.yellowCards > 0 ? `Cart: ${player.yellowCards} ` : ""}
                ${valStr ? `<span class="stat-highlight">${valStr}</span> ` : ""}
                ${player.age ? `Età: ${player.age}` : ""}
            </span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span class="player-rating-modal">${player.rating} RT</span>
            <div class="player-actions-modal">
                <button class="move-btn" title="Schiera Titolare" data-team-code="${teamCode}" data-player-name="${player.name.replace(/"/g, '&quot;')}" data-status="starting">
                    <i class="fa-solid fa-running"></i>
                </button>
                <button class="move-btn" title="Sposta in Panchina" data-team-code="${teamCode}" data-player-name="${player.name.replace(/"/g, '&quot;')}" data-status="bench">
                    <i class="fa-solid fa-chair"></i>
                </button>
                <button class="move-btn" title="Segna come Assente" data-team-code="${teamCode}" data-player-name="${player.name.replace(/"/g, '&quot;')}" data-status="absent">
                    <i class="fa-solid fa-user-minus"></i>
                </button>
                <button class="move-btn whatif-btn" title="Calcola Impatto Infortunio" data-team-code="${teamCode}" data-player-name="${player.name.replace(/"/g, '&quot;')}" style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: var(--accent-emerald);">
                    <i class="fa-solid fa-calculator"></i>
                </button>
            </div>
        </div>
    `;
    return row;
}

// 8. BET SLIP PLANNER RENDERING
export function updateBetSlipUI() {
    const container = document.getElementById("slip-bets-container");
    if (!container) return;
    container.innerHTML = "";

    const slipCountEl = document.getElementById("slip-count");
    if (slipCountEl) slipCountEl.textContent = state.betSlip.length;

    // Synchronize count in mobile trigger badge if it exists
    const mobCountEl = document.getElementById("mobile-slip-count");
    if (mobCountEl) mobCountEl.textContent = state.betSlip.length;

    if (state.betSlip.length === 0) {
        container.innerHTML = `
            <div class="empty-slip-msg">
                <i class="fa-solid fa-calculator"></i>
                <p>Nessun esito selezionato. Seleziona un esito (1, X, 2, U/O, GG/NG) per iniziare.</p>
            </div>
        `;
        document.getElementById("slip-multiplier").textContent = "1.00";
        document.getElementById("slip-confidence-badge").textContent = "N/A";
        document.getElementById("slip-confidence-badge").className = "badge";
        document.getElementById("slip-payout").textContent = "€ 0.00";
        return;
    }

    let multiplier = 1.0;
    let combinedProb = 1.0;

    state.betSlip.forEach(bet => {
        const match = state.matches.concat(state.knockoutMatches).find(m => m.id === bet.matchId);
        if (!match) return;
        const teamA = state.TEAMS_DB[match.teamA];
        const teamB = state.TEAMS_DB[match.teamB];

        multiplier *= bet.odds;

        const oddsData = calculateMatchOdds(match.teamA, match.teamB);
        let selectionConfidence = 0;
        if (bet.choice === "1") selectionConfidence = oddsData.pctA;
        else if (bet.choice === "X") selectionConfidence = oddsData.pctX;
        else if (bet.choice === "2") selectionConfidence = oddsData.pctB;
        else if (bet.choice === "U2.5") selectionConfidence = oddsData.pctUnder;
        else if (bet.choice === "O2.5") selectionConfidence = oddsData.pctOver;
        else if (bet.choice === "GG") selectionConfidence = oddsData.pctGG;
        else if (bet.choice === "NG") selectionConfidence = oddsData.pctNG;

        combinedProb *= (selectionConfidence / 100);

        const betChoiceLabel = bet.choice.replace("U2.5", "Under 2.5").replace("O2.5", "Over 2.5");

        const item = document.createElement("div");
        item.className = "bet-item";
        item.innerHTML = `
            <div class="bet-item-header">
                <span class="bet-item-teams">${teamA.name} - ${teamB.name}</span>
                <button class="btn-remove-bet" data-match-id="${bet.matchId}">
                    <i class="fa-solid fa-circle-xmark"></i>
                </button>
            </div>
            <div class="bet-item-choice-odds">
                <span class="bet-choice-badge">${betChoiceLabel}</span>
                <span class="bet-item-odds-val">${bet.odds.toFixed(2)}</span>
            </div>
        `;
        container.appendChild(item);
    });

    const stake = parseFloat(document.getElementById("slip-stake").value) || 0;
    const finalPayout = stake * multiplier;
    document.getElementById("slip-payout").textContent = `€ ${finalPayout.toFixed(2)}`;
}

// 12. CLASSIFICA MARCATORI LIVE (TOP SCORERS LEADERBOARD)
export function renderScorersLeaderboard() {
    const scorersBody = document.getElementById("scorers-table-body");
    if (!scorersBody) return;

    if (!state.tournamentEvents || state.tournamentEvents.length === 0) {
        scorersBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    Nessun gol segnato finora. Simula delle partite per popolare la classifica!
                </td>
            </tr>`;
        return;
    }

    const stats = {};
    state.tournamentEvents.forEach(evt => {
        const teamCode = evt.team;
        const team = state.TEAMS_DB[teamCode];
        const teamName = team ? `${team.flag} ${team.name}` : teamCode;

        if (evt.scorer) {
            if (!stats[evt.scorer]) {
                stats[evt.scorer] = { name: evt.scorer, team: teamName, goals: 0, assists: 0 };
            }
            stats[evt.scorer].goals++;
        }
        if (evt.assister) {
            if (!stats[evt.assister]) {
                stats[evt.assister] = { name: evt.assister, team: teamName, goals: 0, assists: 0 };
            }
            stats[evt.assister].assists++;
        }
    });

    const list = Object.values(stats).sort((x, y) => {
        if (y.goals !== x.goals) return y.goals - x.goals;
        return y.assists - x.assists;
    });

    scorersBody.innerHTML = "";
    const topScorers = list.slice(0, 10);

    topScorers.forEach((p, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight: 700; color: ${idx === 0 ? 'var(--accent-color)' : 'var(--text-main)'};">#${idx + 1}</td>
            <td class="player-highlight">${p.name}</td>
            <td>${p.team}</td>
            <td class="stat-highlight" style="font-weight: 700; color: var(--accent-color);">${p.goals}</td>
            <td>${p.assists}</td>
        `;
        scorersBody.appendChild(tr);
    });
}

// 13. DISEGNA GRAFICO RADAR SVG H2H
export function drawRadarChart(containerId, teamAName, teamBName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const teamACode = Object.keys(state.TEAMS_DB).find(code => state.TEAMS_DB[code].name === teamAName);
    const teamBCode = Object.keys(state.TEAMS_DB).find(code => state.TEAMS_DB[code].name === teamBName);
    if (!teamACode || !teamBCode) return;

    const depsA = getTeamDepartments(teamACode);
    const depsB = getTeamDepartments(teamBCode);

    const valScoreA = Math.max(30, Math.min(100, Math.round(30 + ((state.squadValuesStats[teamAName]?.total_value || 50000000) / 1500000000) * 70)));
    const valScoreB = Math.max(30, Math.min(100, Math.round(30 + ((state.squadValuesStats[teamBName]?.total_value || 50000000) / 1500000000) * 70)));

    const sbA = state.statsbombStats ? state.statsbombStats[teamAName] : null;
    const sbB = state.statsbombStats ? state.statsbombStats[teamBName] : null;

    const getStatsBombScore = (sb) => {
        if (!sb) return 50;
        const passAcc = sb.pass_accuracy || 75;
        const poss = sb.possession || 50;
        const xgVal = sb.xg || 1.0;
        const score = (poss * 0.4) + (passAcc * 0.4) + (xgVal * 15);
        return Math.max(30, Math.min(100, Math.round(score)));
    };

    const sbScoreA = getStatsBombScore(sbA);
    const sbScoreB = getStatsBombScore(sbB);

    const axes = [
        { name: "Attacco", valA: depsA.att, valB: depsB.att },
        { name: "Centrocampo", valA: depsA.mid, valB: depsB.mid },
        { name: "Difesa", valA: depsA.def, valB: depsB.def },
        { name: "Valore Rosa", valA: valScoreA, valB: valScoreB },
        { name: "Indice StatsBomb", valA: sbScoreA, valB: sbScoreB }
    ];

    const size = 320;
    const center = size / 2;
    const radius = 100;
    const totalAxes = axes.length;

    const getCoords = (index, value) => {
        const angle = (Math.PI * 2 / totalAxes) * index - Math.PI / 2;
        const distance = (value / 100) * radius;
        return {
            x: center + distance * Math.cos(angle),
            y: center + distance * Math.sin(angle)
        };
    };

    let gridHtml = "";
    for (let level = 20; level <= 100; level += 20) {
        const points = [];
        for (let i = 0; i < totalAxes; i++) {
            const coords = getCoords(i, level);
            points.push(`${coords.x},${coords.y}`);
        }
        gridHtml += `<polygon points="${points.join(" ")}" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />`;
        
        const levelCoords = getCoords(0, level);
        gridHtml += `<text x="${levelCoords.x + 5}" y="${levelCoords.y + 12}" fill="rgba(255, 255, 255, 0.25)" font-size="8" font-family="Inter">${level}</text>`;
    }

    let axisLinesHtml = "";
    let labelsHtml = "";
    axes.forEach((axis, i) => {
        const outerCoords = getCoords(i, 100);
        axisLinesHtml += `<line x1="${center}" y1="${center}" x2="${outerCoords.x}" y2="${outerCoords.y}" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />`;

        const angle = (Math.PI * 2 / totalAxes) * i - Math.PI / 2;
        const textDist = radius + 22;
        const tx = center + textDist * Math.cos(angle);
        const ty = center + textDist * Math.sin(angle);
        
        let textAnchor = "middle";
        if (Math.cos(angle) > 0.1) textAnchor = "start";
        else if (Math.cos(angle) < -0.1) textAnchor = "end";

        labelsHtml += `<text x="${tx}" y="${ty + 4}" fill="#8b9bb4" font-size="10" font-family="Inter" font-weight="600" text-anchor="${textAnchor}">${axis.name}</text>`;
    });

    const pointsA = [];
    const pointsB = [];
    axes.forEach((axis, i) => {
        const coordsA = getCoords(i, axis.valA);
        const coordsB = getCoords(i, axis.valB);
        pointsA.push(`${coordsA.x},${coordsA.y}`);
        pointsB.push(`${coordsB.x},${coordsB.y}`);
    });

    container.innerHTML = `
        <div class="radar-chart-title" style="text-align: center; margin: 25px 0 15px; font-family: Outfit; font-weight: 600; font-size: 14px;">
            Confronto Parametrico: <span style="color: #3b82f6;">${teamAName}</span> vs <span style="color: #ef4444;">${teamBName}</span>
        </div>
        <div style="display: flex; justify-content: center; align-items: center; padding: 10px;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <defs>
                    <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="rgba(255, 255, 255, 0.02)" />
                        <stop offset="100%" stop-color="rgba(0, 0, 0, 0)" />
                    </radialGradient>
                </defs>
                <circle cx="${center}" cy="${center}" r="${radius}" fill="url(#radar-glow)" />
                ${gridHtml}
                ${axisLinesHtml}
                <polygon points="${pointsA.join(" ")}" fill="rgba(59, 130, 246, 0.25)" stroke="#3b82f6" stroke-width="2" />
                <polygon points="${pointsB.join(" ")}" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="2" />
                ${axes.map((axis, i) => {
                    const coordsA = getCoords(i, axis.valA);
                    const coordsB = getCoords(i, axis.valB);
                    return `
                        <circle cx="${coordsA.x}" cy="${coordsA.y}" r="3.5" fill="#3b82f6" stroke="#fff" stroke-width="1" />
                        <circle cx="${coordsB.x}" cy="${coordsB.y}" r="3.5" fill="#ef4444" stroke="#fff" stroke-width="1" />
                    `;
                }).join("")}
                ${labelsHtml}
            </svg>
        </div>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 5px; font-size: 11px; margin-bottom: 20px;">
            <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 10px; height: 10px; background: rgba(59, 130, 246, 0.25); border: 2px solid #3b82f6; border-radius: 2px;"></span> ${teamAName}</span>
            <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 10px; height: 10px; background: rgba(239, 68, 68, 0.25); border: 2px solid #ef4444; border-radius: 2px;"></span> ${teamBName}</span>
        </div>
    `;
}

export function openMonteCarlo() {
    const modal = document.getElementById("montecarlo-modal");
    if (!modal) return;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    
    // Reset modal UI fields
    document.getElementById("mc-progress-section").style.display = "none";
    document.getElementById("mc-results-section").style.display = "none";
    document.getElementById("mc-progress-bar").style.width = "0%";
    document.getElementById("mc-progress-pct").textContent = "0%";
    document.getElementById("btn-run-mc").disabled = false;
    document.getElementById("btn-run-mc").innerHTML = `<i class="fa-solid fa-play"></i> Avvia Simulazione`;

    // Render historical convergence chart and super aggregator on opening
    setTimeout(() => {
        renderSuperAggregator();
        renderConvergenceChart();
    }, 100);
}

export function closeMonteCarlo() {
    const modal = document.getElementById("montecarlo-modal");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

export function updateMonteCarloProgress(doneCount, pct, elapsed, remaining) {
    document.getElementById("mc-progress-section").style.display = "block";
    document.getElementById("mc-progress-bar").style.width = `${pct}%`;
    document.getElementById("mc-progress-pct").textContent = `${pct}%`;
    document.getElementById("mc-progress-status").textContent = `Simulati ${doneCount.toLocaleString('it-IT')} tornei...`;
    document.getElementById("mc-elapsed-time").textContent = `Tempo trascorso: ${elapsed}s`;
    document.getElementById("mc-remaining-time").textContent = remaining > 0 ? `Tempo stimato: ${remaining}s` : `Tempo stimato: completato`;
}

export function showMonteCarloResults(results) {
    document.getElementById("mc-results-section").style.display = "block";
    document.getElementById("btn-run-mc").disabled = false;
    document.getElementById("btn-run-mc").innerHTML = `<i class="fa-solid fa-rotate"></i> Simula Nuovamente`;

    // 0. Consensus Table
    const consensusBody = document.getElementById("mc-consensus-body");
    consensusBody.innerHTML = "";
    results.consensus.slice(0, 10).forEach((t, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td style="font-weight: 600; color: var(--text-main);">${t.name}</td>
            <td style="text-align: right;">${t.pctPoisson}%</td>
            <td style="text-align: right;">${t.pctElo}%</td>
            <td style="text-align: right;">${t.pctValue}%</td>
            <td style="text-align: right; font-weight: 700;"><span class="badge ${idx === 0 ? 'high' : (idx < 5 ? 'medium' : 'low')}">${t.pctConsensus}%</span></td>
        `;
        consensusBody.appendChild(tr);
    });

    // 1. Winners Table
    const winnersBody = document.getElementById("mc-winners-body");
    winnersBody.innerHTML = "";
    results.winners.slice(0, 10).forEach((t, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td style="font-weight: 600; color: var(--accent-color);">${t.name}</td>
            <td style="text-align: right; font-weight: 700;">${t.count.toLocaleString('it-IT')}</td>
            <td style="text-align: right;"><span class="badge ${idx === 0 ? 'high' : (idx < 5 ? 'medium' : 'low')}">${t.pct}%</span></td>
        `;
        winnersBody.appendChild(tr);
    });

    // 1b. Semifinalists Table (Top 4 Frequencies)
    const semisBody = document.getElementById("mc-semis-body");
    if (semisBody && results.semifinalists) {
        semisBody.innerHTML = "";
        results.semifinalists.slice(0, 10).forEach((t, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td style="font-weight: 600; color: var(--accent-emerald, #10b981);">${t.name}</td>
                <td style="text-align: right; font-weight: 700;">${t.count.toLocaleString('it-IT')}</td>
                <td style="text-align: right;"><span class="badge ${idx === 0 ? 'high' : (idx < 5 ? 'medium' : 'low')}">${t.pct}%</span></td>
            `;
            semisBody.appendChild(tr);
        });
    }

    // 2. Matchups Table
    const matchupsBody = document.getElementById("mc-matchups-body");
    matchupsBody.innerHTML = "";
    results.matchups.slice(0, 10).forEach((m, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td style="font-weight: 500;">${m.name}</td>
            <td style="text-align: right; font-weight: 700;">${m.count.toLocaleString('it-IT')}</td>
            <td style="text-align: right;"><span class="badge medium">${m.pct}%</span></td>
        `;
        matchupsBody.appendChild(tr);
    });

    // 3. Exact Scores Table
    const scoresBody = document.getElementById("mc-scores-body");
    scoresBody.innerHTML = "";
    results.scores.slice(0, 10).forEach((s, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td style="font-weight: 500; font-family: monospace; font-size: 13px;">${s.name}</td>
            <td style="text-align: right; font-weight: 700;">${s.count.toLocaleString('it-IT')}</td>
            <td style="text-align: right;"><span class="badge medium">${s.pct}%</span></td>
        `;
        scoresBody.appendChild(tr);
    });

    // 4. Inferences & Analytical text
    const inferenceDiv = document.getElementById("mc-inference-text");
    const topConsensus = results.consensus[0];
    const topWinner = results.winners[0];
    const topMatchup = results.matchups[0];
    const topScore = results.scores[0];

    // Calculate penalty shootout percentage
    const penaltyPct = results.scores
        .filter(s => s.name.includes("dcr"))
        .reduce((sum, s) => sum + parseFloat(s.pct), 0)
        .toFixed(2);

    inferenceDiv.innerHTML = `
        <p style="margin-bottom: 10px;">Analisi di convergenza su <strong>${results.total.toLocaleString('it-IT')}</strong> simulazioni multimodello:</p>
        <ul style="padding-left: 15px; margin-bottom: 10px; list-style-type: square;">
            <li style="margin-bottom: 5px;"><strong>Consenso Unito</strong>: La nazionale con il consenso più solido tra tutti i modelli è il <strong>${topConsensus.name}</strong> con una probabilità media del <strong>${topConsensus.pctConsensus}%</strong> (Poisson: ${topConsensus.pctPoisson}%, ELO: ${topConsensus.pctElo}%, Finanziario: ${topConsensus.pctValue}%).</li>
            <li style="margin-bottom: 5px;"><strong>Confronto Modelli</strong>: Nel modello finanziario basato su Transfermarkt, il fattore valore rosa sposta la probabilità a favore delle squadre più ricche, mentre il modello storico ELO premia la continuità di rendimento recente.</li>
            <li style="margin-bottom: 5px;"><strong>Frequenza Finale</strong>: L'accoppiamento di finale più ricorrente nel modello Monte Carlo è <strong>${topMatchup.name}</strong> (${topMatchup.pct}%).</li>
            <li style="margin-bottom: 5px;"><strong>Risultato Esatto</strong>: Il punteggio esatto più frequente della finale è il <strong>${topScore.name}</strong> (${topScore.pct}% del campione).</li>
            <li style="margin-bottom: 5px;">Il <strong>${penaltyPct}%</strong> di tutte le finali si è deciso alla lotteria dei calci di rigore dopo la parità supplementare.</li>
        </ul>
        <p style="font-style: italic; color: var(--text-muted); font-size: 11px; border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 10px;">
            Nota: La tabella di consenso fonde i tre modelli assegnando peso paritetico (1/3) a ciascuna metodologia predittiva per neutralizzare distorsioni statistiche singole.
        </p>
    `;
}

export function renderConvergenceChart() {
    const container = document.getElementById("convergence-chart-container");
    if (!container) return;

    const history = state.simulationHistory || [];
    if (history.length === 0) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 12px; font-style: italic;">
                Esegui delle simulazioni per iniziare a tracciare la convergenza delle probabilità...
            </div>
        `;
        return;
    }

    // Chronological sort
    const sortedHistory = [...history].sort((x, y) => x.timestamp - y.timestamp);

    // 1. Identify the Top 5 teams based on the latest consensus results
    const latestRun = sortedHistory[sortedHistory.length - 1];
    const latestWinners = latestRun.winners || {};
    const topTeams = Object.keys(latestWinners)
        .sort((x, y) => latestWinners[y] - latestWinners[x])
        .slice(0, 5);

    if (topTeams.length === 0) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 12px; font-style: italic;">
                Nessun dato registrato nei run storici.
            </div>
        `;
        return;
    }

    // 2. Compute cumulative values for each step
    const steps = [];
    let cumulativeN = 0;
    const teamWins = {};
    topTeams.forEach(t => teamWins[t] = 0);

    sortedHistory.forEach(run => {
        const N = run.iterations;
        cumulativeN += N;
        topTeams.forEach(t => {
            const pct = run.winners[t] !== undefined ? run.winners[t] : 0;
            teamWins[t] += N * (pct / 100);
        });

        const stepRates = {};
        topTeams.forEach(t => {
            stepRates[t] = (teamWins[t] / cumulativeN) * 100;
        });

        steps.push({
            cumulativeN,
            winRates: stepRates
        });
    });

    // 3. Draw SVG Chart
    const width = container.clientWidth || 800;
    const height = 260;
    const paddingLeft = 50;
    const paddingRight = 30;
    const paddingTop = 30;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Find min/max values for Y axis (win rates)
    let maxRate = 5;
    let minRate = 0;
    topTeams.forEach(t => {
        steps.forEach(s => {
            if (s.winRates[t] > maxRate) maxRate = s.winRates[t];
        });
    });
    maxRate = Math.ceil(maxRate * 1.1); // add 10% breathing room

    // Colors for top 5 teams (harmonious palette)
    const colors = ["#10b981", "#3b82f6", "#f59e0b", "#f43f5e", "#a855f7"];
    const teamColors = {};
    topTeams.forEach((t, i) => teamColors[t] = colors[i]);

    // Map helper coordinates
    const getX = (stepIndex) => {
        if (steps.length <= 1) return paddingLeft + chartWidth / 2;
        return paddingLeft + (stepIndex / (steps.length - 1)) * chartWidth;
    };

    const getY = (rate) => {
        return paddingTop + chartHeight - ((rate - minRate) / (maxRate - minRate)) * chartHeight;
    };

    // Build SVG Grid & Axes
    let gridHtml = "";
    // Y-axis grid lines (5 subdivisions)
    for (let i = 0; i <= 4; i++) {
        const val = minRate + (i / 4) * (maxRate - minRate);
        const y = getY(val);
        gridHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" class="chart-grid-line" />
            <text x="${paddingLeft - 8}" y="${y + 3}" class="chart-text" text-anchor="end">${val.toFixed(1)}%</text>
        `;
    }

    // X-axis grid lines
    steps.forEach((step, idx) => {
        const x = getX(idx);
        gridHtml += `
            <line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${paddingTop + chartHeight}" class="chart-grid-line" />
            <text x="${x}" y="${paddingTop + chartHeight + 15}" class="chart-text" text-anchor="middle">N=${step.cumulativeN.toLocaleString('it-IT')}</text>
        `;
    });

    // Axis Lines
    let axisHtml = `
        <line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${paddingTop + chartHeight}" class="chart-axis-line" />
        <line x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${width - paddingRight}" y2="${paddingTop + chartHeight}" class="chart-axis-line" />
    `;

    // Draw Lines for each team
    let linesHtml = "";
    topTeams.forEach(t => {
        let pathD = "";
        steps.forEach((s, idx) => {
            const x = getX(idx);
            const y = getY(s.winRates[t]);
            pathD += (idx === 0 ? "M" : "L") + ` ${x} ${y}`;
        });

        // Add line
        linesHtml += `
            <path d="${pathD}" class="chart-line" stroke="${teamColors[t]}" stroke-dasharray="1000" stroke-dashoffset="1000">
                <animate attributeName="stroke-dashoffset" values="1000;0" dur="1s" fill="freeze" />
            </path>
        `;

        // Add interactive points
        steps.forEach((s, idx) => {
            const x = getX(idx);
            const y = getY(s.winRates[t]);
            linesHtml += `
                <circle cx="${x}" cy="${y}" r="3.5" class="chart-point" stroke="${teamColors[t]}" data-team="${t}" data-rate="${s.winRates[t].toFixed(2)}" data-n="${s.cumulativeN}">
                    <title>${t}: ${s.winRates[t].toFixed(2)}% (N Totale = ${s.cumulativeN.toLocaleString('it-IT')})</title>
                </circle>
            `;
        });
    });

    // Build Legenda
    let legendHtml = `
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; font-size: 11px; margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px; background: rgba(0,0,0,0.2); padding: 8px 15px; border-radius: 0 0 6px 6px;">
    `;
    topTeams.forEach(t => {
        legendHtml += `
            <span style="display: flex; align-items: center; gap: 5px; font-weight: 500;">
                <span style="width: 10px; height: 10px; background: ${teamColors[t]}; border-radius: 2px; display: inline-block;"></span>
                <span>${t}</span>
            </span>
        `;
    });
    legendHtml += "</div>";

    container.innerHTML = `
        <svg width="100%" height="${height - 40}" viewBox="0 0 ${width} ${height - 40}" style="display: block; overflow: visible;">
            ${gridHtml}
            ${axisHtml}
            ${linesHtml}
        </svg>
        ${legendHtml}
    `;
}

export function renderSuperAggregator() {
    const historySection = document.getElementById("mc-history-section");
    if (!historySection) return;

    const history = state.simulationHistory || [];
    if (history.length === 0) {
        historySection.style.display = "none";
        return;
    }

    historySection.style.display = "block";

    let totalN = 0;
    let totalSemisN = 0;
    const teamWeightedWins = {};
    const teamWeightedSemis = {};

    history.forEach(run => {
        const N = run.iterations || 0;
        totalN += N;

        if (run.winners) {
            Object.keys(run.winners).forEach(team => {
                const pct = run.winners[team] || 0;
                teamWeightedWins[team] = (teamWeightedWins[team] || 0) + (pct / 100) * N;
            });
        }

        if (run.semis) {
            totalSemisN += N;
            Object.keys(run.semis).forEach(team => {
                const pct = run.semis[team] || 0;
                teamWeightedSemis[team] = (teamWeightedSemis[team] || 0) + (pct / 100) * N;
            });
        }
    });

    const formatLargeNumber = (n) => {
        if (n >= 1000000000) {
            return (n / 1000000000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 3 }) + " Miliardi";
        }
        if (n >= 1000000) {
            return (n / 1000000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 3 }) + " Milioni";
        }
        return n.toLocaleString('it-IT');
    };

    // Update total badge
    const totalSimsEl = document.getElementById("mc-total-historical-sims");
    if (totalSimsEl) {
        totalSimsEl.textContent = `Totale: ${formatLargeNumber(totalN)} simulazioni`;
    }

    // Process and sort winners
    const aggregatedWinners = Object.keys(teamWeightedWins).map(team => {
        const count = teamWeightedWins[team];
        const pct = totalN > 0 ? (count / totalN) * 100 : 0;
        return { name: team, count: Math.round(count), pct: pct.toFixed(3) };
    }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

    // Process and sort semis
    const aggregatedSemis = Object.keys(teamWeightedSemis).map(team => {
        const count = teamWeightedSemis[team];
        const pct = totalSemisN > 0 ? (count / totalSemisN) * 100 : 0;
        return { name: team, count: Math.round(count), pct: pct.toFixed(3) };
    }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

    // Render Winners Table
    const winnersBody = document.getElementById("mc-historical-winners-body");
    if (winnersBody) {
        winnersBody.innerHTML = "";
        aggregatedWinners.slice(0, 10).forEach((t, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td style="font-weight: 600; color: var(--accent-color);">${t.name}</td>
                <td style="text-align: right; font-weight: 700;">${t.count.toLocaleString('it-IT')}</td>
                <td style="text-align: right;"><span class="badge ${idx === 0 ? 'high' : (idx < 5 ? 'medium' : 'low')}">${t.pct}%</span></td>
            `;
            winnersBody.appendChild(tr);
        });
    }

    // Render Semis Table
    const semisBody = document.getElementById("mc-historical-semis-body");
    if (semisBody) {
        semisBody.innerHTML = "";
        aggregatedSemis.slice(0, 10).forEach((t, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td style="font-weight: 600; color: var(--accent-emerald, #10b981);">${t.name}</td>
                <td style="text-align: right; font-weight: 700;">${t.count.toLocaleString('it-IT')}</td>
                <td style="text-align: right;"><span class="badge ${idx === 0 ? 'high' : (idx < 5 ? 'medium' : 'low')}">${t.pct}%</span></td>
            `;
            semisBody.appendChild(tr);
        });
    }
}

export function openAbmSimulation(matchId, callback) {
    // Run the actual match simulation first
    simulateMatch(matchId, true);
    
    // Find the match data
    let isKnockout = false;
    let m = state.matches.find(x => x.id === matchId);
    if (!m) {
        m = state.knockoutMatches.find(x => x.id === matchId);
        isKnockout = true;
    }
    if (!m) {
        if (callback) callback();
        return;
    }

    const teamA = state.TEAMS_DB[m.teamA];
    const teamB = state.TEAMS_DB[m.teamB];
    if (!teamA || !teamB) {
        if (callback) callback();
        return;
    }

    // Find all goals/events generated for this match
    const matchEvents = state.tournamentEvents ? state.tournamentEvents.filter(evt => evt.matchId === matchId) : [];

    // Create dynamic overlay modal
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(10, 15, 30, 0.9)";
    overlay.style.backdropFilter = "blur(8px)";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";
    overlay.style.color = "var(--text-main, #fff)";
    overlay.style.fontFamily = "Outfit, Inter, sans-serif";

    const container = document.createElement("div");
    container.style.width = "90%";
    container.style.maxWidth = "900px";
    container.style.background = "var(--bg-card, #1e293b)";
    container.style.borderRadius = "12px";
    container.style.border = "1px solid var(--border-color, #334155)";
    container.style.overflow = "hidden";
    container.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.5)";
    container.style.display = "flex";
    container.style.flexDirection = "column";

    // Header
    const header = document.createElement("div");
    header.style.padding = "15px 20px";
    header.style.background = "linear-gradient(135deg, #1e3a8a, #0f172a)";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.borderBottom = "1px solid var(--border-color, #334155)";

    const scoreTitle = document.createElement("div");
    scoreTitle.style.display = "flex";
    scoreTitle.style.alignItems = "center";
    scoreTitle.style.gap = "15px";
    scoreTitle.style.fontSize = "18px";
    scoreTitle.style.fontWeight = "600";

    const scoreboard = document.createElement("span");
    scoreboard.id = "abm-scoreboard";
    scoreboard.style.background = "rgba(0,0,0,0.5)";
    scoreboard.style.padding = "4px 12px";
    scoreboard.style.borderRadius = "20px";
    scoreboard.style.fontFamily = "monospace";
    scoreboard.style.color = "var(--accent-color, #f97316)";
    scoreboard.textContent = `0 - 0`;

    scoreTitle.innerHTML = `
        <span style="font-size:24px;">${teamA.flag}</span>
        <span>${teamA.name}</span>
    `;
    scoreTitle.appendChild(scoreboard);
    scoreTitle.innerHTML += `
        <span>${teamB.name}</span>
        <span style="font-size:24px;">${teamB.flag}</span>
    `;

    const clock = document.createElement("div");
    clock.id = "abm-clock";
    clock.style.fontSize = "20px";
    clock.style.fontWeight = "700";
    clock.style.color = "var(--accent-emerald, #10b981)";
    clock.textContent = `0'`;

    header.appendChild(scoreTitle);
    header.appendChild(clock);

    // Body (Canvas + Event Log)
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexWrap = "wrap";
    body.style.padding = "15px";
    body.style.gap = "15px";
    body.style.background = "#0f172a";

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 380;
    canvas.style.background = "#14532d"; // Green field
    canvas.style.borderRadius = "8px";
    canvas.style.border = "2px solid #22c55e";
    canvas.style.flex = "1 1 500px";

    const logContainer = document.createElement("div");
    logContainer.style.width = "220px";
    logContainer.style.height = "380px";
    logContainer.style.background = "rgba(0,0,0,0.4)";
    logContainer.style.border = "1px solid var(--border-color, #334155)";
    logContainer.style.borderRadius = "8px";
    logContainer.style.padding = "10px";
    logContainer.style.overflowY = "auto";
    logContainer.style.display = "flex";
    logContainer.style.flexDirection = "column";
    logContainer.style.gap = "6px";
    logContainer.style.fontSize = "12px";
    logContainer.style.color = "#94a3b8";

    const logTitle = document.createElement("div");
    logTitle.style.fontWeight = "600";
    logTitle.style.color = "#fff";
    logTitle.style.borderBottom = "1px solid #334155";
    logTitle.style.paddingBottom = "5px";
    logTitle.style.marginBottom = "5px";
    logTitle.textContent = "Log Eventi ABM (Beta)";
    logContainer.appendChild(logTitle);

    body.appendChild(canvas);
    body.appendChild(logContainer);

    // Footer
    const footer = document.createElement("div");
    footer.style.padding = "10px 20px";
    footer.style.display = "flex";
    footer.style.justifyContent = "space-between";
    footer.style.alignItems = "center";
    footer.style.background = "var(--bg-card, #1e293b)";
    footer.style.borderTop = "1px solid var(--border-color, #334155)";

    const skipBtn = document.createElement("button");
    skipBtn.textContent = "Salta Simulazione";
    skipBtn.style.background = "rgba(244, 63, 94, 0.2)";
    skipBtn.style.border = "1px solid rgba(244, 63, 94, 0.4)";
    skipBtn.style.color = "#f43f5e";
    skipBtn.style.padding = "8px 16px";
    skipBtn.style.borderRadius = "6px";
    skipBtn.style.cursor = "pointer";
    skipBtn.style.fontWeight = "600";
    skipBtn.style.fontSize = "13px";

    footer.appendChild(document.createElement("div")); // placeholder
    footer.appendChild(skipBtn);

    container.appendChild(header);
    container.appendChild(body);
    container.appendChild(footer);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Initialize 22 Player Agents
    const players = [];
    const teamAColor = "#3b82f6"; // Blue
    const teamBColor = "#ef4444"; // Red

    // Helper for positions
    function addTeamPlayers(teamCode, isLeft, color) {
        const team = state.TEAMS_DB[teamCode];
        const starters = team.players.filter(p => p.status === "starting").slice(0, 11);
        
        // Simple default coordinates scaled to canvas (600x380)
        const baseCoords = [
            { x: isLeft ? 50 : 550, y: 190 }, // GK
            { x: isLeft ? 150 : 450, y: 80 },  // DF
            { x: isLeft ? 150 : 450, y: 150 }, // DF
            { x: isLeft ? 150 : 450, y: 230 }, // DF
            { x: isLeft ? 150 : 450, y: 300 }, // DF
            { x: isLeft ? 300 : 300, y: 100 }, // MF
            { x: isLeft ? 280 : 320, y: 190 }, // MF
            { x: isLeft ? 300 : 300, y: 280 }, // MF
            { x: isLeft ? 450 : 150, y: 80 },  // FW
            { x: isLeft ? 480 : 120, y: 190 }, // FW
            { x: isLeft ? 450 : 150, y: 300 }  // FW
        ];

        starters.forEach((p, idx) => {
            const coord = baseCoords[idx] || { x: 300, y: 190 };
            players.push({
                name: p.name,
                pos: p.pos,
                rating: p.rating,
                isLeft,
                color,
                x: coord.x,
                y: coord.y,
                targetX: coord.x,
                targetY: coord.y,
                vx: 0,
                vy: 0
            });
        });
    }

    addTeamPlayers(m.teamA, true, teamAColor);
    addTeamPlayers(m.teamB, false, teamBColor);

    // Ball state
    const ball = {
        x: 300,
        y: 190,
        targetX: 300,
        targetY: 190,
        vx: 0,
        vy: 0,
        owner: null
    };

    let minute = 0;
    let isGameOver = false;
    let frame = 0;
    let scoreA = 0;
    let scoreB = 0;
    let gameLoopId = null;
    let goalPauseTimer = 0;
    let currentGoalEvent = null;

    function addLog(text, color = "#fff") {
        const item = document.createElement("div");
        item.style.color = color;
        item.style.padding = "2px 0";
        item.innerHTML = text;
        logContainer.appendChild(item);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    addLog("Fischio d'inizio! Partita avviata.", "var(--accent-emerald, #10b981)");

    const ctx = canvas.getContext("2d");

    function update() {
        if (isGameOver) return;

        if (goalPauseTimer > 0) {
            goalPauseTimer--;
            if (goalPauseTimer === 0) {
                // Reset positions after goal
                ball.x = 300;
                ball.y = 190;
                ball.owner = null;
                players.forEach(p => {
                    p.x = p.targetX;
                    p.y = p.targetY;
                });
            }
            return;
        }

        frame++;
        if (frame % 8 === 0) {
            minute++;
            clock.textContent = `${minute}'`;
            
            // Check for pre-determined goals at this minute
            const goalsThisMin = matchEvents.filter(e => e.minute === minute);
            if (goalsThisMin.length > 0) {
                const goal = goalsThisMin[0];
                currentGoalEvent = goal;
                goalPauseTimer = 60; // Pause for 2 seconds (60 frames)
                
                if (goal.team === m.teamA) {
                    scoreA++;
                    addLog(`⚽ <strong>GOOL!</strong> ${goal.scorer} segna per ${teamA.name}!`, "#3b82f6");
                } else {
                    scoreB++;
                    addLog(`⚽ <strong>GOOL!</strong> ${goal.scorer} segna per ${teamB.name}!`, "#ef4444");
                }
                document.getElementById("abm-scoreboard").textContent = `${scoreA} - ${scoreB}`;
            }

            // Casual commentary log
            if (minute % 15 === 0 && minute < 90 && goalsThisMin.length === 0) {
                const actions = [
                    "Fase tattica intensa a centrocampo.",
                    "Ottimo recupero difensivo.",
                    "Tiro dalla distanza parato con facilità.",
                    "Azione insistita sulle fasce laterali.",
                    "Fallo tattico a bloccare la ripartenza."
                ];
                const action = actions[Math.floor(Math.random() * actions.length)];
                addLog(`${minute}' - ${action}`);
            }

            if (minute >= 90) {
                isGameOver = true;
                addLog(`Fischio finale! Partita conclusa.`, "var(--accent-color, #f97316)");
                clock.textContent = "90'";
                setTimeout(closeModal, 1500);
            }
        }

        // Draw Soccer field lines
        ctx.fillStyle = "#166534"; // green pitch
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Lines
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

        // Half line
        ctx.beginPath();
        ctx.moveTo(300, 10);
        ctx.lineTo(300, 370);
        ctx.stroke();

        // Center circle
        ctx.beginPath();
        ctx.arc(300, 190, 50, 0, 2 * Math.PI);
        ctx.stroke();

        // Goal areas
        ctx.strokeRect(10, 110, 60, 160);
        ctx.strokeRect(530, 110, 60, 160);

        // Draw players
        players.forEach(p => {
            // Basic ABM behavior towards the ball or back to defend
            let dx = ball.x - p.x;
            let dy = ball.y - p.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 80 && !p.isGK) {
                p.x += (dx / dist) * 2;
                p.y += (dy / dist) * 2;
            } else {
                let tx = p.targetX - p.x;
                let ty = p.targetY - p.y;
                let tdist = Math.sqrt(tx * tx + ty * ty);
                if (tdist > 5) {
                    p.x += (tx / tdist) * 1.5;
                    p.y += (ty / tdist) * 1.5;
                }
            }

            // Draw player circle
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Draw role indicator
            ctx.fillStyle = "#fff";
            ctx.font = "8px monospace";
            ctx.textAlign = "center";
            ctx.fillText(p.pos, p.x, p.y + 3);
        });

        // Draw Ball
        if (goalPauseTimer > 0 && currentGoalEvent) {
            let targetGoalX = currentGoalEvent.team === m.teamA ? 580 : 20;
            let targetGoalY = 190;
            ball.x += (targetGoalX - ball.x) * 0.15;
            ball.y += (targetGoalY - ball.y) * 0.15;

            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(150, 140, 300, 100);
            ctx.strokeStyle = "var(--accent-color, #f97316)";
            ctx.strokeRect(150, 140, 300, 100);

            ctx.fillStyle = "#fff";
            ctx.font = "bold 24px Outfit";
            ctx.textAlign = "center";
            ctx.fillText("⚽ RETE!", 300, 185);
            ctx.font = "14px Inter";
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.fillText(currentGoalEvent.scorer, 300, 215);
        } else {
            let closestPlayer = null;
            let minDist = Infinity;
            players.forEach(p => {
                let dx = p.x - ball.x;
                let dy = p.y - ball.y;
                let d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) {
                    minDist = d;
                    closestPlayer = p;
                }
            });

            if (closestPlayer && minDist < 15) {
                if (Math.random() < 0.08) {
                    let teammates = players.filter(p => p.isLeft === closestPlayer.isLeft && p !== closestPlayer);
                    let target = teammates[Math.floor(Math.random() * teammates.length)];
                    ball.vx = (target.x - ball.x) * 0.08;
                    ball.vy = (target.y - ball.y) * 0.08;
                } else {
                    ball.x = closestPlayer.x + (closestPlayer.isLeft ? 5 : -5);
                    ball.y = closestPlayer.y;
                    ball.vx = 0;
                    ball.vy = 0;
                }
            } else {
                ball.x += ball.vx;
                ball.y += ball.vy;
                ball.vx *= 0.95;
                ball.vy *= 0.95;

                ball.x = Math.max(15, Math.min(585, ball.x));
                ball.y = Math.max(15, Math.min(365, ball.y));
            }
        }

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#fbbf24";
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.stroke();
    }

    function loop() {
        update();
        if (!isGameOver) {
            gameLoopId = requestAnimationFrame(loop);
        }
    }

    function closeModal() {
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
        }
        overlay.remove();
        if (callback) callback();
    }

    skipBtn.addEventListener("click", closeModal);

    loop();
}

export function renderHistoricalBacktestResults(results) {
    const resultsArea = document.getElementById("bt-results-area");
    if (!resultsArea) return;
    resultsArea.style.display = "block";

    const brierScore = parseFloat(results.brierScore);
    const brierEl = document.getElementById("bt-res-brier");
    const ratingEl = document.getElementById("bt-res-brier-rating");
    
    if (brierEl) brierEl.textContent = results.brierScore;
    
    if (ratingEl) {
        if (brierScore <= 0.58) {
            ratingEl.textContent = "Accuratezza Eccellente";
            ratingEl.style.color = "#10b981";
        } else if (brierScore <= 0.64) {
            ratingEl.textContent = "Accuratezza Ottima";
            ratingEl.style.color = "#34d399";
        } else if (brierScore <= 0.70) {
            ratingEl.textContent = "Accuratezza Buona";
            ratingEl.style.color = "#f59e0b";
        } else {
            ratingEl.textContent = "Accuratezza Moderata";
            ratingEl.style.color = "#f97316";
        }
    }

    const champEl = document.getElementById("bt-res-champ");
    if (champEl) champEl.textContent = results.actualChampion;

    const champStatsEl = document.getElementById("bt-res-champ-stats");
    if (champStatsEl) {
        champStatsEl.textContent = `Favorevole (Rank #${results.championRank} - ${results.championPct}%)`;
    }

    const winnersBody = document.getElementById("bt-winners-body");
    if (winnersBody) {
        winnersBody.innerHTML = "";
        results.winners.slice(0, 5).forEach((t, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td style="font-weight: 600; color: var(--accent-color);">${t.name}</td>
                <td style="text-align: right; font-weight: 700;">${parseFloat(t.pct).toFixed(1)}%</td>
            `;
            winnersBody.appendChild(tr);
        });
    }

    const semisBody = document.getElementById("bt-semis-body");
    if (semisBody) {
        semisBody.innerHTML = "";
        results.semis.slice(0, 5).forEach((t, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td style="font-weight: 600; color: var(--accent-emerald, #10b981);">${t.name}</td>
                <td style="text-align: right; font-weight: 700;">${parseFloat(t.pct).toFixed(1)}%</td>
            `;
            semisBody.appendChild(tr);
        });
    }
}

