import { state, saveLocalState } from './state.js';
import { CONFIG, GROUP_STAGE_DATES } from './config.js';

// 1. CALCOLO FORZA REPARTI DINAMICA (ATT, MID, DEF)
export function getTeamDepartments(teamCode) {
    const team = state.TEAMS_DB[teamCode];
    if (!team) return { att: 50, mid: 50, def: 50 };

    const players = team.players;
    const starters = players.filter(p => p.status === "starting");
    
    const defStarters = starters.filter(p => p.pos === "D" || p.pos === "P");
    const midStarters = starters.filter(p => p.pos === "C");
    const attStarters = starters.filter(p => p.pos === "A");

    let attVal = 0;
    if (attStarters.length > 0) {
        const ratingSum = attStarters.reduce((sum, p) => sum + p.rating, 0);
        const goalsBonus = attStarters.reduce((sum, p) => sum + Math.min(10, p.goals * 0.4), 0);
        attVal = (ratingSum / attStarters.length) + goalsBonus;
    } else {
        attVal = 40; // Penalty for playing without forwards
    }

    let midVal = 0;
    if (midStarters.length > 0) {
        const ratingSum = midStarters.reduce((sum, p) => sum + p.rating, 0);
        const assistsBonus = midStarters.reduce((sum, p) => sum + Math.min(8, p.assists * 0.4), 0);
        midVal = (ratingSum / midStarters.length) + assistsBonus;
    } else {
        midVal = 40;
    }

    let defVal = 0;
    if (defStarters.length > 0) {
        const ratingSum = defStarters.reduce((sum, p) => sum + p.rating, 0);
        const cardsMalus = defStarters.reduce((sum, p) => sum + Math.min(5, p.yellowCards * 0.3), 0);
        defVal = (ratingSum / defStarters.length) - cardsMalus;
    } else {
        defVal = 40;
    }

    // Bench depth contribution
    const benchPlayers = players.filter(p => p.status === "bench");
    const benchBonus = Math.min(3, benchPlayers.reduce((sum, p) => sum + (p.rating * 0.02), 0));

    attVal = Math.round(attVal + benchBonus);
    midVal = Math.round(midVal + benchBonus);
    defVal = Math.round(defVal + benchBonus);

    return {
        att: Math.max(35, Math.min(99, attVal)),
        mid: Math.max(35, Math.min(99, midVal)),
        def: Math.max(35, Math.min(99, defVal))
    };
}

// 2. CALCOLO PROBABILITÀ POISSON
export function calculatePoissonProbability(lambda, k) {
    // Safeguard lambda range to prevent NaN or extreme underflow
    const safeLambda = Math.max(0.1, Math.min(8.0, lambda));
    const e = Math.exp(-safeLambda);
    let factorial = 1;
    for (let i = 1; i <= k; i++) factorial *= i;
    return (Math.pow(safeLambda, k) * e) / factorial;
}

// 3. CALCOLO QUOTE ED xG DITTAGLIATO PER UNA PARTITA
// A simple deterministic hash function to ensure bookie odds are stable across re-renders
function getDeterministicHash(teamA, teamB, market) {
    const str = teamA + teamB + market;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

export function calculateMatchOdds(teamACode, teamBCode) {
    const teamA = state.TEAMS_DB[teamACode];
    const teamB = state.TEAMS_DB[teamBCode];
    if (!teamA || !teamB) {
        // Return blank values if database is not fully populated yet
        return {
            pctA: 33, pctX: 34, pctB: 33,
            oddA: "3.00", oddX: "3.00", oddB: "3.00",
            pctUnder: 50, pctOver: 50,
            oddUnder: "2.00", oddOver: "2.00",
            pctGG: 50, pctNG: 50,
            oddGG: "2.00", oddNG: "2.00",
            xgA: "1.3", xgB: "1.3",
            recChoice: "X", recOdd: "3.00",
            bookieOddA: "2.80", bookieOddX: "2.80", bookieOddB: "2.80",
            bookieOddUnder: "1.85", bookieOddOver: "1.85",
            bookieOddGG: "1.85", bookieOddNG: "1.85",
            valueBets: [], hasValueBet: false, bestValueBet: null
        };
    }

    const depsA = getTeamDepartments(teamACode);
    const depsB = getTeamDepartments(teamBCode);

    // Host factor scaling
    let hostBonusA = ["MEX", "USA", "CAN"].includes(teamACode) ? CONFIG.hostBonus : 1.0;
    let hostBonusB = ["MEX", "USA", "CAN"].includes(teamBCode) ? CONFIG.hostBonus : 1.0;

    const ratingA = (depsA.att + depsA.mid + depsA.def) / 3;
    const ratingB = (depsB.att + depsB.mid + depsB.def) / 3;

    // Blended strength (40% history, 60% dynamic lineup)
    const strengthA = (teamA.baseStrength * 0.40) + (ratingA * 0.60);
    const strengthB = (teamB.baseStrength * 0.40) + (ratingB * 0.60);

    const attDefRatioA = Math.pow(depsA.att / depsB.def, 1.4);
    const attDefRatioB = Math.pow(depsB.att / depsA.def, 1.4);
    const midRatioA = Math.pow(depsA.mid / depsB.mid, 0.9);
    const midRatioB = Math.pow(depsB.mid / depsA.mid, 0.9);

    const qualityRatioA = Math.pow(strengthA / strengthB, 2.2);
    const qualityRatioB = Math.pow(strengthB / strengthA, 2.2);

    // Live squad financial values factor
    const valA = teamA.players.reduce((sum, p) => sum + (p.value || 0), 0) || 50000000;
    const valB = teamB.players.reduce((sum, p) => sum + (p.value || 0), 0) || 50000000;
    const valueRatio = valA / valB;
    const valueFactor = Math.pow(valueRatio, 0.18);

    const baseGoals = (state.recurrencesStats && state.recurrencesStats.avg_goals_wc) ? state.recurrencesStats.avg_goals_wc : CONFIG.baseGoalsWCFallback;
    const baseLambda = baseGoals / 2;

    let lambdaA = qualityRatioA * attDefRatioA * midRatioA * baseLambda * hostBonusA;
    let lambdaB = qualityRatioB * attDefRatioB * midRatioB * baseLambda * hostBonusB;

    // Financial scaling
    lambdaA *= Math.sqrt(valueFactor);
    lambdaB /= Math.sqrt(valueFactor);

    // Cap lambda strictly to prevent mathematical underflow (Bug 1 Fix)
    lambdaA = Math.min(8.0, Math.max(0.1, lambdaA));
    lambdaB = Math.min(8.0, Math.max(0.1, lambdaB));

    const maxGoals = CONFIG.maxPoissonGoals;
    const distA = [];
    const distB = [];
    
    for (let g = 0; g <= maxGoals; g++) {
        distA.push(calculatePoissonProbability(lambdaA, g));
        distB.push(calculatePoissonProbability(lambdaB, g));
    }

    // Safe normalization
    const sumA = distA.reduce((sum, v) => sum + v, 0);
    const sumB = distB.reduce((sum, v) => sum + v, 0);
    for (let g = 0; g <= maxGoals; g++) {
        distA[g] = sumA > 0 ? (distA[g] / sumA) : (g === 1 ? 1.0 : 0.0);
        distB[g] = sumB > 0 ? (distB[g] / sumB) : (g === 1 ? 1.0 : 0.0);
    }

    let winA = 0;
    let winB = 0;
    let draw = 0;
    let under25 = 0;

    for (let a = 0; a <= maxGoals; a++) {
        for (let b = 0; b <= maxGoals; b++) {
            const prob = distA[a] * distB[b];
            
            if (a > b) winA += prob;
            else if (a < b) winB += prob;
            else draw += prob;

            if (a + b < 2.5) under25 += prob;
        }
    }

    // Bayesian historical Head to Head blending
    let winPctA = 0.33, winPctB = 0.33, drawPct = 0.34;
    let hasH2H = false;
    let recordPlayed = 0;
    if (state.h2hStats && state.h2hStats[teamA.name] && state.h2hStats[teamA.name][teamB.name]) {
        const rec = state.h2hStats[teamA.name][teamB.name];
        if (rec.played >= 3) {
            winPctA = rec.win / rec.played;
            winPctB = rec.loss / rec.played;
            drawPct = rec.draw / rec.played;
            hasH2H = true;
            recordPlayed = rec.played;
        }
    }

    if (hasH2H) {
        const h2hWeight = Math.min(recordPlayed, 8) * 0.02; // max weight: 16%
        winA = winA * (1 - h2hWeight) + winPctA * h2hWeight;
        winB = winB * (1 - h2hWeight) + winPctB * h2hWeight;
        draw = draw * (1 - h2hWeight) + drawPct * h2hWeight;
    }

    // Goal / No Goal probability calculation
    const noGoalA = distA[0];
    const noGoalB = distB[0];
    const noGoal = noGoalA + noGoalB - (noGoalA * noGoalB);
    const ggProb = 1 - noGoal;

    // Safe probability calculations summing to exactly 100% and preventing negatives (Bug 2 Fix)
    const totalProb = winA + winB + draw;
    const finalWinA = winA / totalProb;
    const finalWinB = winB / totalProb;
    const finalDraw = draw / totalProb;

    let pctA = Math.round(finalWinA * 100);
    let pctB = Math.round(finalWinB * 100);
    let pctX = 100 - pctA - pctB;

    if (pctX < 0) {
        const diff = -pctX;
        if (pctA > pctB) pctA -= diff;
        else pctB -= diff;
        pctX = 0;
    }

    const pctUnder = Math.round(under25 * 100);
    const pctOver = 100 - pctUnder;

    const pctGG = Math.round(ggProb * 100);
    const pctNG = 100 - pctGG;

    // Odds calculations (Minimum 1% probability to prevent Division by Zero or quota 1000+)
    const getOdd = (pct) => {
        const p = Math.max(CONFIG.minProbForOdds, pct) / 100;
        return Math.min(CONFIG.maxOddValue, Math.max(CONFIG.minOddValue, 1.00 / p));
    };

    const oddA = getOdd(pctA);
    const oddX = getOdd(pctX);
    const oddB = getOdd(pctB);
    const oddUnder = getOdd(pctUnder);
    const oddOver = getOdd(pctOver);
    const oddGG = getOdd(pctGG);
    const oddNG = getOdd(pctNG);

    // Recommended choice advisor
    let recChoice = "1";
    let recOdd = oddA;

    if (pctA >= 48) {
        recChoice = "1";
        recOdd = oddA;
    } else if (pctB >= 48) {
        recChoice = "2";
        recOdd = oddB;
    } else if (pctUnder >= 55) {
        recChoice = "U2.5";
        recOdd = oddUnder;
    } else if (pctGG >= 55) {
        recChoice = "GG";
        recOdd = oddGG;
    } else if (pctOver >= 55) {
        recChoice = "O2.5";
        recOdd = oddOver;
    } else if (pctNG >= 55) {
        recChoice = "NG";
        recOdd = oddNG;
    } else {
        const choices = [
            { label: "1", prob: pctA, odd: oddA },
            { label: "X", prob: pctX, odd: oddX },
            { label: "2", prob: pctB, odd: oddB }
        ];
        choices.sort((x, y) => y.prob - x.prob);
        recChoice = choices[0].label;
        recOdd = choices[0].odd;
    }

    // MOCK BOOKMAKER ODDS WITH VALUE BET DETECTION
    const getBookieOddAndEV = (fairProb, market) => {
        const hash = getDeterministicHash(teamACode, teamBCode, market);
        // Fluctuation from -0.04 to +0.03 to sometimes trigger value bets (> 5% EV)
        const fluctuation = ((hash % 80) / 1000) - 0.04;
        // Apply 8% standard bookmaker margin (1.08 factor) and fluctuation
        const bookieProb = Math.min(0.98, Math.max(0.02, fairProb * 1.08 + fluctuation));
        const bookieOdd = Math.min(CONFIG.maxOddValue, Math.max(CONFIG.minOddValue, 1.00 / bookieProb));
        
        // Expected Value = (our_fair_prob * bookie_odd) - 1
        const ev = (fairProb * bookieOdd) - 1;
        return {
            odd: bookieOdd.toFixed(2),
            ev: ev
        };
    };

    const bookieA = getBookieOddAndEV(finalWinA, "1");
    const bookieX = getBookieOddAndEV(finalDraw, "X");
    const bookieB = getBookieOddAndEV(finalWinB, "2");
    
    const bookieUnder = getBookieOddAndEV(under25, "Under");
    const bookieOver = getBookieOddAndEV(1.0 - under25, "Over");
    
    const bookieGG = getBookieOddAndEV(ggProb, "GG");
    const bookieNG = getBookieOddAndEV(noGoal, "NG");

    const valueBets = [];
    if (bookieA.ev > 0.05) valueBets.push({ choice: "1", ev: bookieA.ev, bookieOdd: bookieA.odd });
    if (bookieX.ev > 0.05) valueBets.push({ choice: "X", ev: bookieX.ev, bookieOdd: bookieX.odd });
    if (bookieB.ev > 0.05) valueBets.push({ choice: "2", ev: bookieB.ev, bookieOdd: bookieB.odd });
    if (bookieUnder.ev > 0.05) valueBets.push({ choice: "U2.5", ev: bookieUnder.ev, bookieOdd: bookieUnder.odd });
    if (bookieOver.ev > 0.05) valueBets.push({ choice: "O2.5", ev: bookieOver.ev, bookieOdd: bookieOver.odd });
    if (bookieGG.ev > 0.05) valueBets.push({ choice: "GG", ev: bookieGG.ev, bookieOdd: bookieGG.odd });
    if (bookieNG.ev > 0.05) valueBets.push({ choice: "NG", ev: bookieNG.ev, bookieOdd: bookieNG.odd });

    // Sort descending by EV
    valueBets.sort((x, y) => y.ev - x.ev);

    return {
        pctA, pctX, pctB,
        oddA: oddA.toFixed(2),
        oddX: oddX.toFixed(2),
        oddB: oddB.toFixed(2),
        pctUnder, pctOver,
        oddUnder: oddUnder.toFixed(2),
        oddOver: oddOver.toFixed(2),
        pctGG, pctNG,
        oddGG: oddGG.toFixed(2),
        oddNG: oddNG.toFixed(2),
        xgA: lambdaA.toFixed(1),
        xgB: lambdaB.toFixed(1),
        recChoice: recChoice,
        recOdd: recOdd.toFixed(2),

        // Bookmaker Odds
        bookieOddA: bookieA.odd,
        bookieOddX: bookieX.odd,
        bookieOddB: bookieB.odd,
        bookieOddUnder: bookieUnder.odd,
        bookieOddOver: bookieOver.odd,
        bookieOddGG: bookieGG.odd,
        bookieOddNG: bookieNG.odd,

        // Value Bets info
        valueBets: valueBets,
        hasValueBet: valueBets.length > 0,
        bestValueBet: valueBets.length > 0 ? valueBets[0] : null
    };
}

// 4. GENERATORE CALENDARIO E PARTITE GIRONI
export function generateSchedule() {
    state.matches = [];
    const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    let matchId = 1;
    
    groups.forEach((grp, grpIdx) => {
        const groupTeams = Object.keys(state.TEAMS_DB).filter(code => state.TEAMS_DB[code].group === grp);
        
        const pairings = [
            { a: groupTeams[0], b: groupTeams[1], round: 1, dateOffset: 0 },
            { a: groupTeams[2], b: groupTeams[3], round: 1, dateOffset: 0 },
            { a: groupTeams[0], b: groupTeams[2], round: 2, dateOffset: 5 },
            { a: groupTeams[1], b: groupTeams[3], round: 2, dateOffset: 5 },
            { a: groupTeams[0], b: groupTeams[3], round: 3, dateOffset: 10 },
            { a: groupTeams[1], b: groupTeams[2], round: 3, dateOffset: 10 }
        ];

        pairings.forEach((pair, pairIdx) => {
            // Calcola data reale staccata e distribuita per la fase a gironi
            let dayIndex = 0;
            if (pair.round === 1) {
                // Primo incontro il giorno X, secondo incontro il giorno X+1 per scaglionare
                dayIndex = Math.floor(grpIdx / 2) + (pairIdx % 2);
            } else if (pair.round === 2) {
                // Round 2 scaglionata
                dayIndex = 6 + Math.floor(grpIdx / 2.4) + (pairIdx % 2);
            } else {
                // Round 3 giocata in contemporanea per lo stesso girone per correttezza sportiva
                dayIndex = 12 + Math.floor(grpIdx / 2.4);
            }
            
            // Protezione out of bounds per l'array delle date
            dayIndex = Math.min(GROUP_STAGE_DATES.length - 1, dayIndex);
            const dateStr = GROUP_STAGE_DATES[dayIndex];

            // Simulated fairplay penalties
            const fpA = -Math.floor(Math.random() * 3);
            const fpB = -Math.floor(Math.random() * 3);

            state.matches.push({
                id: matchId++,
                group: grp,
                round: pair.round,
                teamA: pair.a,
                teamB: pair.b,
                scoreA: null,
                scoreB: null,
                date: dateStr,
                fairPlayPenaltyA: fpA,
                fairPlayPenaltyB: fpB
            });
        });
    });
}

// 5. INIZIALIZZAZIONE CLASSIFICHE LIVE
export function initializeGroups() {
    const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    groups.forEach(grp => {
        state.standings[grp] = [];
        const groupTeams = Object.keys(state.TEAMS_DB).filter(code => state.TEAMS_DB[code].group === grp);
        groupTeams.forEach(code => {
            state.standings[grp].push({
                code: code, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, gs: 0, gd: 0, pts: 0, fairplay: 0
            });
        });
    });
}

// 6. RICALCOLA CLASSIFICHE GIRONI
export function recalculateStandings() {
    initializeGroups();

    state.matches.forEach(m => {
        const grp = m.group;
        const standingList = state.standings[grp];
        
        const teamAStats = standingList.find(s => s.code === m.teamA);
        const teamBStats = standingList.find(s => s.code === m.teamB);

        if (m.scoreA !== null && m.scoreB !== null) {
            teamAStats.fairplay += m.fairPlayPenaltyA;
            teamBStats.fairplay += m.fairPlayPenaltyB;
            teamAStats.played++;
            teamBStats.played++;
            teamAStats.gf += m.scoreA;
            teamAStats.gs += m.scoreB;
            teamBStats.gf += m.scoreB;
            teamBStats.gs += m.scoreA;
            teamAStats.gd = teamAStats.gf - teamAStats.gs;
            teamBStats.gd = teamBStats.gf - teamBStats.gs;

            if (m.scoreA > m.scoreB) {
                teamAStats.won++; teamAStats.pts += 3; teamBStats.lost++;
            } else if (m.scoreA < m.scoreB) {
                teamBStats.won++; teamBStats.pts += 3; teamAStats.lost++;
            } else {
                teamAStats.drawn++; teamAStats.pts += 1; teamBStats.drawn++; teamBStats.pts += 1;
            }
        }
    });

    Object.keys(state.standings).forEach(grp => {
        state.standings[grp].sort((x, y) => {
            if (y.pts !== x.pts) return y.pts - x.pts;
            if (y.gd !== x.gd) return y.gd - x.gd;
            if (y.gf !== x.gf) return y.gf - x.gf;
            return y.fairplay - x.fairplay; 
        });
    });

    saveLocalState();
    populateRoundOf32();
}

// 7. INIZIALIZZAZIONE STRUTTURA DEL TABELLONE ELIMINAZIONE DIRETTA (KNOCKOUT)
export function initializeKnockoutMatches() {
    state.knockoutMatches = [];
    
    // 16 Matches of Round of 32
    for (let i = 1; i <= 16; i++) {
        state.knockoutMatches.push({
            id: 100 + i,
            round: "32",
            matchNumber: i,
            teamA: null,
            teamB: null,
            scoreA: null,
            scoreB: null,
            penaltiesWinner: null,
            nextMatchId: 116 + Math.ceil(i / 2),
            nextMatchSlot: i % 2 === 1 ? "A" : "B",
            date: "Da definire"
        });
    }

    // 8 Matches of Round of 16
    for (let i = 1; i <= 8; i++) {
        state.knockoutMatches.push({
            id: 116 + i,
            round: "16",
            matchNumber: i,
            teamA: null,
            teamB: null,
            scoreA: null,
            scoreB: null,
            penaltiesWinner: null,
            nextMatchId: 124 + Math.ceil(i / 2),
            nextMatchSlot: i % 2 === 1 ? "A" : "B",
            date: "Ottavi di finale"
        });
    }

    // 4 Matches of Quarter-Finals
    for (let i = 1; i <= 4; i++) {
        state.knockoutMatches.push({
            id: 124 + i,
            round: "8",
            matchNumber: i,
            teamA: null,
            teamB: null,
            scoreA: null,
            scoreB: null,
            penaltiesWinner: null,
            nextMatchId: 128 + Math.ceil(i / 2),
            nextMatchSlot: i % 2 === 1 ? "A" : "B",
            date: "Quarti di finale"
        });
    }

    // 2 Matches of Semi-Finals
    for (let i = 1; i <= 2; i++) {
        state.knockoutMatches.push({
            id: 128 + i,
            round: "4",
            matchNumber: i,
            teamA: null,
            teamB: null,
            scoreA: null,
            scoreB: null,
            penaltiesWinner: null,
            nextMatchId: 131,
            nextMatchSlot: i % 2 === 1 ? "A" : "B",
            date: "Semifinale"
        });
    }

    // Grand Final
    state.knockoutMatches.push({
        id: 131,
        round: "2",
        matchNumber: 1,
        teamA: null,
        teamB: null,
        scoreA: null,
        scoreB: null,
        penaltiesWinner: null,
        nextMatchId: null,
        date: "Finale (19 Luglio 2026)"
    });
}

// 8. POPOLA SEDICESIMI (ROUND OF 32)
export function populateRoundOf32() {
    const groupMatchesUnfinished = state.matches.some(m => m.scoreA === null || m.scoreB === null);
    if (groupMatchesUnfinished) {
        state.knockoutMatches.forEach(km => {
            km.teamA = null;
            km.teamB = null;
            km.scoreA = null;
            km.scoreB = null;
            km.penaltiesWinner = null;
        });
        saveLocalState();
        return;
    }

    // Get best third placed teams
    const allThirds = [];
    Object.keys(state.standings).forEach(grp => {
        const thirdPlaceTeam = state.standings[grp][2];
        if (thirdPlaceTeam) {
            allThirds.push({ ...thirdPlaceTeam, group: grp });
        }
    });

    allThirds.sort((x, y) => {
        if (y.pts !== x.pts) return y.pts - x.pts;
        if (y.gd !== x.gd) return y.gd - x.gd;
        if (y.gf !== x.gf) return y.gf - x.gf;
        return y.fairplay - x.fairplay;
    });

    const best8Thirds = allThirds.slice(0, 8).map(t => t.code);

    const get1st = (g) => state.standings[g][0].code;
    const get2nd = (g) => state.standings[g][1].code;

    const slots = [
        { a: get1st("A"), b: best8Thirds[0] }, // Match 1
        { a: get1st("L"), b: best8Thirds[1] }, // Match 2
        { a: get1st("C"), b: get2nd("F") },     // Match 3
        { a: get2nd("E"), b: get2nd("I") },     // Match 4
        { a: get1st("B"), b: best8Thirds[2] }, // Match 5
        { a: get1st("K"), b: best8Thirds[3] }, // Match 6
        { a: get1st("J"), b: get2nd("H") },     // Match 7
        { a: get2nd("D"), b: get2nd("G") },     // Match 8
        { a: get1st("D"), b: best8Thirds[4] }, // Match 9
        { a: get1st("G"), b: best8Thirds[5] }, // Match 10
        { a: get2nd("K"), b: get2nd("L") },     // Match 11
        { a: get1st("H"), b: get2nd("J") },     // Match 12
        { a: get2nd("A"), b: get2nd("B") },     // Match 13
        { a: get1st("F"), b: get2nd("C") },     // Match 14
        { a: get1st("E"), b: best8Thirds[6] }, // Match 15
        { a: get1st("I"), b: best8Thirds[7] }  // Match 16
    ];

    slots.forEach((s, idx) => {
        const km = state.knockoutMatches.find(m => m.round === "32" && m.matchNumber === (idx + 1));
        if (km) {
            km.teamA = s.a;
            km.teamB = s.b;
        }
    });

    recalculateKnockoutProgression();
}

// 9. PROGRESSIONE TABELLONE ELIMINAZIONE DIRETTA
export function recalculateKnockoutProgression() {
    const rounds = ["32", "16", "8", "4"];
    
    rounds.forEach(rnd => {
        const roundMatches = state.knockoutMatches.filter(m => m.round === rnd);
        roundMatches.forEach(m => {
            if (m.teamA && m.teamB && m.scoreA !== null && m.scoreB !== null) {
                let winner = null;
                if (m.scoreA > m.scoreB) {
                    winner = m.teamA;
                } else if (m.scoreA < m.scoreB) {
                    winner = m.teamB;
                } else {
                    winner = m.penaltiesWinner === "A" ? m.teamA : (m.penaltiesWinner === "B" ? m.teamB : null);
                }

                if (winner && m.nextMatchId) {
                    const nextMatch = state.knockoutMatches.find(x => x.id === m.nextMatchId);
                    if (nextMatch) {
                        if (m.nextMatchSlot === "A") {
                            nextMatch.teamA = winner;
                        } else {
                            nextMatch.teamB = winner;
                        }
                    }
                }
            } else {
                clearChildrenKnockoutSlots(m.nextMatchId, m.nextMatchSlot);
            }
        });
    });

    saveLocalState();
}

export function clearChildrenKnockoutSlots(matchId, slot) {
    if (!matchId) return;
    const match = state.knockoutMatches.find(x => x.id === matchId);
    if (match) {
        if (slot === "A") {
            match.teamA = null;
        } else {
            match.teamB = null;
        }
        match.scoreA = null;
        match.scoreB = null;
        match.penaltiesWinner = null;
        
        clearChildrenKnockoutSlots(match.nextMatchId, match.nextMatchSlot);
    }
}

// 10. POISSON RANDOM SAMPLING (KNUTH'S ALGORITHM)
export function samplePoisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
        k++;
        p *= Math.random();
    } while (p > L && k < 30);
    return k - 1;
}

// 11. SIMULA UN SINGOLO MATCH (CON EVENTI MARCATORE/ASSIST & RE-CALCOLO CLASSIFICHE/TABELLONE)
export function simulateMatch(matchId) {
    let isKnockout = false;
    let m = state.matches.find(x => x.id === matchId);
    if (!m) {
        m = state.knockoutMatches.find(x => x.id === matchId);
        isKnockout = true;
    }
    if (!m || !m.teamA || !m.teamB) return;

    // Calcola lambda per le due squadre basandoci sulla formazione corrente
    const odds = calculateMatchOdds(m.teamA, m.teamB);
    const lambdaA = parseFloat(odds.xgA);
    const lambdaB = parseFloat(odds.xgB);

    let scoreA = samplePoisson(lambdaA);
    let scoreB = samplePoisson(lambdaB);

    let extraTime = false;
    let penWinner = null;

    // Gestione parità nei match a eliminazione diretta
    if (isKnockout && scoreA === scoreB) {
        extraTime = true;
        // 30 min supplementari (1/3 dei gol attesi regolamentari)
        const etScoreA = samplePoisson(lambdaA / 3);
        const etScoreB = samplePoisson(lambdaB / 3);
        scoreA += etScoreA;
        scoreB += etScoreB;

        if (scoreA === scoreB) {
            // Rigori (50/50 simulato)
            penWinner = Math.random() < 0.5 ? "A" : "B";
        }
    }

    m.scoreA = scoreA;
    m.scoreB = scoreB;
    if (isKnockout) {
        m.penaltiesWinner = penWinner;
    }

    // Pulisci vecchi eventi marcatori per questa partita per evitare duplicati
    state.tournamentEvents = state.tournamentEvents.filter(evt => evt.matchId !== matchId);

    const teamA = state.TEAMS_DB[m.teamA];
    const teamB = state.TEAMS_DB[m.teamB];

    const getStarters = (team) => {
        let starters = team.players.filter(p => p.status === "starting");
        if (starters.length === 0) starters = team.players;
        return starters;
    };

    const startersA = getStarters(teamA);
    const startersB = getStarters(teamB);

    // Seleziona un marcatore pesato per ruolo e rating
    const selectScorer = (starters) => {
        const weighted = starters.map(p => {
            let weight = 1.0;
            if (p.pos === "A") weight = 5.0;
            else if (p.pos === "C") weight = 2.0;
            else if (p.pos === "D") weight = 0.5;
            else if (p.pos === "P") weight = 0.01;
            
            weight *= (p.rating || 50);
            return { player: p, weight };
        });

        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
        let roll = Math.random() * totalWeight;
        for (let i = 0; i < weighted.length; i++) {
            roll -= weighted[i].weight;
            if (roll <= 0) return weighted[i].player;
        }
        return starters[0];
    };

    // Seleziona un assistman pesato per ruolo e rating
    const selectAssister = (starters, scorer) => {
        const remaining = starters.filter(p => p.name !== scorer.name);
        if (remaining.length === 0) return null;

        const weighted = remaining.map(p => {
            let weight = 1.0;
            if (p.pos === "C") weight = 5.0;
            else if (p.pos === "A") weight = 3.0;
            else if (p.pos === "D") weight = 1.0;
            else if (p.pos === "P") weight = 0.0;
            
            weight *= (p.rating || 50);
            return { player: p, weight };
        });

        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
        if (totalWeight <= 0) return null;

        let roll = Math.random() * totalWeight;
        for (let i = 0; i < weighted.length; i++) {
            roll -= weighted[i].weight;
            if (roll <= 0) return weighted[i].player;
        }
        return null;
    };

    // Simula marcatori per Team A
    for (let i = 0; i < scoreA; i++) {
        const scorer = selectScorer(startersA);
        let assister = null;
        if (Math.random() < 0.6) {
            assister = selectAssister(startersA, scorer);
        }
        const isEtGoal = extraTime && (i >= (scoreA - 1)); // Ultimi gol nei supplementari
        const minute = isEtGoal ? Math.floor(Math.random() * 30) + 91 : Math.floor(Math.random() * 90) + 1;

        state.tournamentEvents.push({
            matchId,
            team: m.teamA,
            scorer: scorer.name,
            assister: assister ? assister.name : null,
            minute
        });
    }

    // Simula marcatori per Team B
    for (let i = 0; i < scoreB; i++) {
        const scorer = selectScorer(startersB);
        let assister = null;
        if (Math.random() < 0.6) {
            assister = selectAssister(startersB, scorer);
        }
        const isEtGoal = extraTime && (i >= (scoreB - 1));
        const minute = isEtGoal ? Math.floor(Math.random() * 30) + 91 : Math.floor(Math.random() * 90) + 1;

        state.tournamentEvents.push({
            matchId,
            team: m.teamB,
            scorer: scorer.name,
            assister: assister ? assister.name : null,
            minute
        });
    }

    // Aggiorna lo stato e propaga
    if (!isKnockout) {
        recalculateStandings();
    } else {
        recalculateKnockoutProgression();
    }
}

// 12. SIMULA TUTTO IL GIRONE
export function simulateAllGroups() {
    state.matches.forEach(m => {
        if (m.scoreA === null || m.scoreB === null) {
            simulateMatch(m.id);
        }
    });
    recalculateStandings();
}

// 13. SIMULA TUTTE LE FASI FINALI (ED EVENTUALMENTE I GIRONI)
export function simulateAllKnockouts() {
    // Prima simula i gironi se non finiti
    simulateAllGroups();

    const rounds = ["32", "16", "8", "4", "2"];
    rounds.forEach(rnd => {
        const roundMatches = state.knockoutMatches.filter(m => m.round === rnd);
        roundMatches.forEach(m => {
            if (m.teamA && m.teamB && (m.scoreA === null || m.scoreB === null)) {
                simulateMatch(m.id);
            }
        });
    });
}
