const fs = require('fs');
const path = require('path');

const WORKSPACE = path.join(__dirname, '..');
const TEAMS_DB_PATH = path.join(WORKSPACE, 'data', 'teams.json');
const OUTPUT_DIR = path.join(WORKSPACE, 'data', 'stats');

const simToDataset = {
    'Messico': 'Mexico',
    'Sudafrica': 'South Africa',
    'Corea del Sud': 'South Korea',
    'Repubblica Ceca': 'Czechia',
    'Canada': 'Canada',
    'Bosnia Erzegovina': 'Bosnia and Herzegovina',
    'Qatar': 'Qatar',
    'Svizzera': 'Switzerland',
    'Brasile': 'Brazil',
    'Marocco': 'Morocco',
    'Haiti': 'Haiti',
    'Scozia': 'Scotland',
    'Stati Uniti': 'United States',
    'Paraguay': 'Paraguay',
    'Australia': 'Australia',
    'Turchia': 'Turkey',
    'Germania': 'Germany',
    'Curaçao': 'Curacao',
    "Costa d'Avorio": "Cote d'Ivoire",
    'Ecuador': 'Ecuador',
    'Paesi Basi': 'Netherlands',
    'Paesi Bassi': 'Netherlands',
    'Giappone': 'Japan',
    'Svezia': 'Sweden',
    'Tunisia': 'Tunisia',
    'Belgio': 'Belgium',
    'Egitto': 'Egypt',
    'Iran': 'Iran',
    'Nuova Zelanda': 'New Zealand',
    'Spagna': 'Spain',
    'Capo Verde': 'Cape Verde',
    'Arabia Saudita': 'Saudi Arabia',
    'Uruguay': 'Uruguay',
    'Francia': 'France',
    'Senegal': 'Senegal',
    'Iraq': 'Iraq',
    'Norvegia': 'Norway',
    'Argentina': 'Argentina',
    'Algeria': 'Algeria',
    'Austria': 'Austria',
    'Giordania': 'Jordan',
    'Portogallo': 'Portugal',
    'RD Congo': 'DR Congo',
    'Uzbekistan': 'Uzbekistan',
    'Colombia': 'Colombia',
    'Inghilterra': 'England',
    'Croazia': 'Croatia',
    'Ghana': 'Ghana',
    'Panama': 'Panama'
};

function normalizeName(s) {
    if (!s) return "";
    s = s.toLowerCase().trim();
    // Remove diacritics
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\band\b/g, '').replace(/\bco\.\b/g, '').replace(/&/g, '');
    return s.split(/\s+/).filter(Boolean).join(' ');
}

const normMap = {};
for (const [simName, dsName] of Object.entries(simToDataset)) {
    normMap[normalizeName(dsName)] = simName;
    normMap[normalizeName(simName)] = simName;
}

normMap[normalizeName("Korea Republic")] = "Corea del Sud";
normMap[normalizeName("South Korea")] = "Corea del Sud";
normMap[normalizeName("Czech Republic")] = "Repubblica Ceca";
normMap[normalizeName("Cote d'Ivoire")] = "Costa d'Avorio";
normMap[normalizeName("Ivory Coast")] = "Costa d'Avorio";
normMap[normalizeName("Congo DR")] = "RD Congo";
normMap[normalizeName("DR Congo")] = "RD Congo";
normMap[normalizeName("Democratic Republic of the Congo")] = "RD Congo";
normMap[normalizeName("Turkey")] = "Turchia";
normMap[normalizeName("Turkiye")] = "Turchia";
normMap[normalizeName("USA")] = "Stati Uniti";
normMap[normalizeName("United States")] = "Stati Uniti";

function getSimTeamName(dsName) {
    const nd = normalizeName(dsName);
    if (normMap[nd]) return normMap[nd];
    for (const [key, val] of Object.entries(normMap)) {
        if (nd.includes(key) || key.includes(nd)) {
            return val;
        }
    }
    return null;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function main() {
    console.log("=========================================");
    console.log("STARTING JS-BASED DATA ARCHIVE ETL");
    console.log("=========================================");

    // 1. Load active database
    if (!fs.existsSync(TEAMS_DB_PATH)) {
        console.error("Error: teams.json database not found at " + TEAMS_DB_PATH);
        return;
    }
    const teamsDb = JSON.parse(fs.readFileSync(TEAMS_DB_PATH, 'utf8'));
    const allSimTeams = new Set();
    for (const key of Object.keys(teamsDb)) {
        allSimTeams.add(teamsDb[key].name);
    }
    console.log(`Loaded ${allSimTeams.size} active teams from local database.`);

    // 2. Load shootouts.csv
    const shootoutsPath = path.join(WORKSPACE, 'archive-historical', 'shootouts.csv');
    const shootouts = {};
    if (fs.existsSync(shootoutsPath)) {
        console.log("Loading shootouts database...");
        const shLines = fs.readFileSync(shootoutsPath, 'utf8').split(/\r?\n/).filter(Boolean);
        const headers = parseCSVLine(shLines[0]);
        const dateIdx = headers.indexOf('date');
        const homeIdx = headers.indexOf('home_team');
        const awayIdx = headers.indexOf('away_team');
        const winnerIdx = headers.indexOf('winner');

        for (let i = 1; i < shLines.length; i++) {
            const cols = parseCSVLine(shLines[i]);
            if (cols.length < headers.length) continue;
            const key = `${cols[dateIdx]}_${cols[homeIdx]}_${cols[awayIdx]}`;
            shootouts[key] = cols[winnerIdx];
        }
    }

    // 3. Load results.csv
    const resultsPath = path.join(WORKSPACE, 'archive-historical', 'results.csv');
    if (!fs.existsSync(resultsPath)) {
        console.error("Error: results.csv not found!");
        return;
    }
    console.log("Processing matches from results.csv...");
    const resLines = fs.readFileSync(resultsPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const resHeaders = parseCSVLine(resLines[0]);
    
    const dateIdx = resHeaders.indexOf('date');
    const homeIdx = resHeaders.indexOf('home_team');
    const awayIdx = resHeaders.indexOf('away_team');
    const homeScoreIdx = resHeaders.indexOf('home_score');
    const awayScoreIdx = resHeaders.indexOf('away_score');
    const tournamentIdx = resHeaders.indexOf('tournament');
    const neutralIdx = resHeaders.indexOf('neutral');

    const h2h = {};
    const wcMatches = [];

    // Initialize H2H arrays
    for (const t1 of allSimTeams) {
        h2h[t1] = {};
        for (const t2 of allSimTeams) {
            if (t1 !== t2) {
                h2h[t1][t2] = {
                    played: 0, win: 0, draw: 0, loss: 0,
                    gf: 0, ga: 0, shootout_wins: 0, matches: []
                };
            }
        }
    }

    for (let i = 1; i < resLines.length; i++) {
        const cols = parseCSVLine(resLines[i]);
        if (cols.length < resHeaders.length) continue;

        const homeRaw = cols[homeIdx];
        const awayRaw = cols[awayIdx];
        const homeSim = getSimTeamName(homeRaw);
        const awaySim = getSimTeamName(awayRaw);

        const homeScore = cols[homeScoreIdx] !== "" && cols[homeScoreIdx] !== "NA" ? parseInt(cols[homeScoreIdx]) : null;
        const awayScore = cols[awayScoreIdx] !== "" && cols[awayScoreIdx] !== "NA" ? parseInt(cols[awayScoreIdx]) : null;

        if (homeScore === null || awayScore === null || isNaN(homeScore) || isNaN(awayScore)) {
            continue;
        }

        const dateStr = cols[dateIdx];
        const tournament = cols[tournamentIdx];
        const neutral = cols[neutralIdx].toLowerCase() === 'true';

        if (tournament === "FIFA World Cup") {
            wcMatches.append({
                date: dateStr,
                home: homeSim || homeRaw,
                away: awaySim || awayRaw,
                home_score: homeScore,
                away_score: awayScore,
                neutral: neutral
            });
        }

        if (homeSim && awaySim && allSimTeams.has(homeSim) && allSimTeams.has(awaySim)) {
            if (homeSim === awaySim) continue;

            const shKey = `${dateStr}_${homeRaw}_${awayRaw}`;
            const shWinner = shootouts[shKey];
            const shWinnerSim = shWinner ? getSimTeamName(shWinner) : null;

            // Update home -> away stats
            const recA = h2h[homeSim][awaySim];
            recA.played += 1;
            recA.gf += homeScore;
            recA.ga += awayScore;

            // Update away -> home stats
            const recB = h2h[awaySim][homeSim];
            recB.played += 1;
            recB.gf += awayScore;
            recB.ga += homeScore;

            // Log individual match for historical timeline using compact arrays:
            // [date, tournament, score_t1_t2, is_t1_home, shootout_winner_is_t1]
            const swCodeHome = shWinnerSim ? (shWinnerSim === homeSim ? 1 : 2) : null;
            const matchSummaryHome = [
                dateStr,
                tournament,
                `${homeScore}-${awayScore}`,
                true, // is_t1_home
                swCodeHome
            ];
            recA.matches.push(matchSummaryHome);

            const swCodeAway = shWinnerSim ? (shWinnerSim === awaySim ? 1 : 2) : null;
            const matchSummaryAway = [
                dateStr,
                tournament,
                `${awayScore}-${homeScore}`,
                false, // is_t1_home
                swCodeAway
            ];
            recB.matches.push(matchSummaryAway);

            if (homeScore > awayScore) {
                recA.win += 1;
                recB.loss += 1;
            } else if (homeScore < awayScore) {
                recA.loss += 1;
                recB.win += 1;
            } else {
                recA.draw += 1;
                recB.draw += 1;

                if (shWinnerSim === homeSim) {
                    recA.shootout_wins += 1;
                } else if (shWinnerSim === awaySim) {
                    recB.shootout_wins += 1;
                }
            }
        }
    }

    // Cleanup and save H2H JSON
    const h2hCompact = {};
    for (const [t1, opponents] of Object.entries(h2h)) {
        h2hCompact[t1] = {};
        for (const [t2, data] of Object.entries(opponents)) {
            if (data.played > 0) {
                // Keep latest 5 matches, sorted by date (index 0)
                data.matches = data.matches.sort((x, y) => y[0].localeCompare(x[0])).slice(0, 5);
                h2hCompact[t1][t2] = data;
            }
        }
    }

    // Calculate Recurrences
    let totalWcGoals = 0;
    const totalWcMatches = wcMatches.length;
    const exactScoresCount = {};
    let neutralDrawCount = 0;
    let neutralMatchCount = 0;

    wcMatches.forEach(m => {
        const homeS = m.home_score;
        const awayS = m.away_score;
        totalWcGoals += (homeS + awayS);

        const scoreKey = `${Math.max(homeS, awayS)}-${Math.min(homeS, awayS)}`;
        exactScoresCount[scoreKey] = (exactScoresCount[scoreKey] || 0) + 1;

        if (m.neutral) {
            neutralMatchCount += 1;
            if (homeS === awayS) {
                neutralDrawCount += 1;
            }
        }
    });

    const avgWcGoals = totalWcMatches > 0 ? (totalWcGoals / totalWcMatches) : 2.65;
    const neutralDrawRate = neutralMatchCount > 0 ? (neutralDrawCount / neutralMatchCount) : 0.25;

    const sortedScores = Object.entries(exactScoresCount).sort((x, y) => y[1] - x[1]);
    const exactScoresPct = [];
    sortedScores.slice(0, 10).forEach(([scoreKey, count]) => {
        exactScoresPct.push({
            score: scoreKey,
            count: count,
            pct: totalWcMatches > 0 ? parseFloat(((count / totalWcMatches) * 100).toFixed(2)) : 0
        });
    });

    const recurrencesData = {
        avg_goals_wc: parseFloat(avgWcGoals.toFixed(3)),
        total_wc_matches_analyzed: totalWcMatches,
        knockout_draw_rate: parseFloat(neutralDrawRate.toFixed(3)),
        exact_scores: exactScoresPct
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'h2h_stats.json'), JSON.stringify(h2hCompact), 'utf8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'recurrences.json'), JSON.stringify(recurrencesData, null, 2), 'utf8');
    console.log("H2H stats and recurrences written successfully to data/stats/");
}

// Array append fallback logic
if (!Array.prototype.append) {
    Array.prototype.append = Array.prototype.push;
}

main();
