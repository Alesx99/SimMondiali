import { state } from './state.js';
import { CONFIG, GROUP_STAGE_DATES } from './config.js';
import { calculateMatchOdds, getTeamDepartments } from './engine.js';

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
                    <i class="fa-solid fa-lightbulb"></i> Consigliato: <strong>${oddsData.recChoice} @ ${oddsData.recOdd}</strong>
                </span>
                <div class="match-actions-group" style="display: flex; gap: 8px;">
                    <button class="btn-simulate-match secondary-btn" data-match-id="${m.id}" style="padding: 6px 12px; font-size: 11px;">
                        <i class="fa-solid fa-dice"></i> Simula
                    </button>
                    <button class="btn-lineup-manage" data-match-id="${m.id}">
                        <i class="fa-solid fa-users-gear"></i> Gestisci Lineup
                    </button>
                </div>
            </div>
        `;

        // Direct input change listener
        const scoreAInput = card.querySelector(".team-a-score");
        const scoreBInput = card.querySelector(".team-b-score");

        const handleScoreChange = () => {
            const valA = scoreAInput.value;
            const valB = scoreBInput.value;

            if (valA !== "" && valB !== "") {
                const parsedA = parseInt(valA);
                const parsedB = parseInt(valB);
                m.scoreA = isNaN(parsedA) || parsedA < 0 ? 0 : parsedA;
                m.scoreB = isNaN(parsedB) || parsedB < 0 ? 0 : parsedB;
                scoreAInput.value = m.scoreA;
                scoreBInput.value = m.scoreB;
            } else {
                m.scoreA = null;
                m.scoreB = null;
                state.tournamentEvents = state.tournamentEvents.filter(evt => evt.matchId !== m.id);
            }
            
            const event = new CustomEvent("scoreChanged");
            document.dispatchEvent(event);
        };

        scoreAInput.addEventListener("input", handleScoreChange);
        scoreBInput.addEventListener("input", handleScoreChange);

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
    container.innerHTML = "";

    const rounds = [
        { code: "32", label: "Sedicesimi (Round of 32)" },
        { code: "16", label: "Ottavi" },
        { code: "8", label: "Quarti" },
        { code: "4", label: "Semifinale" },
        { code: "2", label: "Finale" }
    ];

    rounds.forEach((rnd, rIdx) => {
        const col = document.createElement("div");
        col.className = `bracket-round-column round-${rnd.code}`;
        
        const header = document.createElement("div");
        header.className = "bracket-round-header";
        header.textContent = rnd.label;
        col.appendChild(header);

        const roundMatches = state.knockoutMatches.filter(m => m.round === rnd.code);
        
        roundMatches.forEach((m, mIdx) => {
            const node = document.createElement("div");
            
            if (!m.teamA && !m.teamB) {
                node.className = "bracket-match-node empty";
                node.dataset.matchId = m.id;
                node.innerHTML = `<div style="text-align: center; font-size: 10px; color: var(--text-muted);">In attesa dei gironi...</div>`;
            } else {
                node.className = "bracket-match-node";
                node.dataset.matchId = m.id;
                
                const teamA = m.teamA ? state.TEAMS_DB[m.teamA] : { name: "TBD", flag: "🏳️", code: "" };
                const teamB = m.teamB ? state.TEAMS_DB[m.teamB] : { name: "TBD", flag: "🏳️", code: "" };

                let oddsHtml = "";
                if (m.teamA && m.teamB) {
                    const oddsData = calculateMatchOdds(m.teamA, m.teamB);
                    
                    // Map recommended odds to bookmaker mock odds
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
                            <span class="br-rec-odd">Consigliato: <strong>${oddsData.recChoice}</strong></span>
                            <span class="stat-highlight br-add-odds-trigger" style="font-size: 9px; cursor: pointer; color: var(--accent-blue);" data-match-id="${m.id}" data-choice="${oddsData.recChoice}" data-odds="${bookieRecOdd}">
                                Quota: ${bookieRecOdd} <i class="fa-solid fa-cart-plus"></i>
                            </span>
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

                // Scorers lists inside bracket nodes
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
                        <div style="display: flex; gap: 8px;">
                            <span class="br-simulate-trigger" style="cursor:pointer; color: var(--accent-color);" data-match-id="${m.id}"><i class="fa-solid fa-dice"></i> Simula</span>
                            <span class="br-lineup-trigger" style="cursor:pointer;" data-match-id="${m.id}"><i class="fa-solid fa-users-gear"></i> Lineup</span>
                        </div>
                        ` : ""}
                    </div>
                    
                    <div class="br-team-row ${teamAClass}">
                        <div class="br-team-info">
                            <span>${teamA.flag}</span>
                            <span title="${teamA.name}">${teamA.name}</span>
                            ${scNamesA ? `<small class="br-scorers-small" style="display:block; font-size: 8px; color: var(--text-muted);">${scNamesA}</small>` : ''}
                        </div>
                        <div class="br-score-inputs">
                            <input type="number" class="br-score-inp team-a-score" min="0" value="${m.scoreA !== null ? m.scoreA : ''}" ${!m.teamA || !m.teamB ? 'disabled' : ''}>
                        </div>
                    </div>

                    <!-- Penalty Selector for Draws -->
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
                            <span>${teamB.flag}</span>
                            <span title="${teamB.name}">${teamB.name}</span>
                            ${scNamesB ? `<small class="br-scorers-small" style="display:block; font-size: 8px; color: var(--text-muted);">${scNamesB}</small>` : ''}
                        </div>
                        <div class="br-score-inputs">
                            <input type="number" class="br-score-inp team-b-score" min="0" value="${m.scoreB !== null ? m.scoreB : ''}" ${!m.teamA || !m.teamB ? 'disabled' : ''}>
                        </div>
                    </div>
                    
                    ${oddsHtml}
                `;

                // Handle score changes directly
                const scoreAInput = node.querySelector(".team-a-score");
                const scoreBInput = node.querySelector(".team-b-score");

                const handleKnockoutScoreChange = () => {
                    const valA = scoreAInput.value;
                    const valB = scoreBInput.value;

                    if (valA !== "" && valB !== "") {
                        const parsedA = parseInt(valA);
                        const parsedB = parseInt(valB);
                        m.scoreA = isNaN(parsedA) || parsedA < 0 ? 0 : parsedA;
                        m.scoreB = isNaN(parsedB) || parsedB < 0 ? 0 : parsedB;
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
                    
                    const event = new CustomEvent("knockoutScoreChanged");
                    document.dispatchEvent(event);
                };

                if (scoreAInput && scoreBInput) {
                    scoreAInput.addEventListener("input", handleKnockoutScoreChange);
                    scoreBInput.addEventListener("input", handleKnockoutScoreChange);
                }
            }

            col.appendChild(node);
        });

        container.appendChild(col);
    });
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
            let shootoutInfo = "";
            if (m.shootout_winner) {
                shootoutInfo = ` <span class="badge medium">Rigori vinti da: ${m.shootout_winner}</span>`;
            }

            // Dynamically format score as Team A vs Team B
            let displayScore = m.score;
            if (m.home_team && m.away_team) {
                const parts = m.score.split('-');
                if (parts.length === 2) {
                    const homeScore = parts[0];
                    const awayScore = parts[1];
                    if (m.home_team === teamAName) {
                        displayScore = `${homeScore}-${awayScore}`;
                    } else {
                        displayScore = `${awayScore}-${homeScore}`;
                    }
                }
            }

            timelineHtml += `
                <div class="timeline-row">
                    <span class="timeline-date">${m.date}</span>
                    <span class="timeline-tour">${m.tournament}</span>
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
