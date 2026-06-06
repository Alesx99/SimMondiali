import { state } from './state.js';
import { calculateMatchOdds, calculatePoissonProbability } from './engine.js';

// Fast Poisson sampler
function samplePoisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
        k++;
        p *= Math.random();
    } while (p > L && k < 30);
    return k - 1;
}

export function runMonteCarlo(totalSimulations, modelSelection, onProgress, onComplete) {
    // 1. Prepare data structures for speed
    const teams = Object.keys(state.TEAMS_DB);
    if (teams.length === 0) {
        onComplete(null);
        return;
    }

    // Cache match lambdas for Poisson model to avoid O(N) calculations in every simulation
    const lambdaCache = {};
    function getMatchLambdas(teamA, teamB) {
        const key = `${teamA}_${teamB}`;
        if (!lambdaCache[key]) {
            const odds = calculateMatchOdds(teamA, teamB);
            lambdaCache[key] = {
                xgA: parseFloat(odds.xgA),
                xgB: parseFloat(odds.xgB)
            };
        }
        return lambdaCache[key];
    }

    // Precalculate alternative model parameters for all teams
    const eloScores = {};
    const valueScores = {};
    const deptScores = {};
    teams.forEach(code => {
        const team = state.TEAMS_DB[code];
        
        // Model 2: Elo Rating (based on baseStrength + starters average rating)
        const starters = team.players.filter(p => p.status === "starting");
        const avgRating = starters.reduce((sum, p) => sum + p.rating, 0) / (starters.length || 1);
        eloScores[code] = team.baseStrength * 0.4 + avgRating * 0.6;

        // Model 3: Financial Value score (sum of player valuations capped to min 50M)
        const totalValue = team.players.reduce((sum, p) => sum + (p.value || 0), 0) || 50000000;
        valueScores[code] = Math.pow(totalValue, 0.25);

        // Precalculate departments for Markov
        const att = starters.filter(p => p.pos === "A");
        const mid = starters.filter(p => p.pos === "M" || p.pos === "C");
        const def = starters.filter(p => p.pos === "D" || p.pos === "P");
        deptScores[code] = {
            att: att.length > 0 ? att.reduce((sum, p) => sum + p.rating, 0) / att.length : 75,
            mid: mid.length > 0 ? mid.reduce((sum, p) => sum + p.rating, 0) / mid.length : 75,
            def: def.length > 0 ? def.reduce((sum, p) => sum + p.rating, 0) / def.length : 75
        };
    });

    // Helper for Markov Match simulation
    function simulateMarkovMatch(teamA, teamB, minutes = 90) {
        const deptA = deptScores[teamA];
        const deptB = deptScores[teamB];
        let scoreA = 0;
        let scoreB = 0;
        let pos = Math.random() < 0.5 ? "A" : "B";
        let stateVal = 0; // 0: Building, 1: Midfield, 2: Offense, 3: Set Piece, 4: Shot

        for (let m = 1; m <= minutes; m++) {
            const roll = Math.random();
            if (pos === "A") {
                if (stateVal === 0) {
                    const pMid = 0.5 + (deptA.mid - deptB.mid) / 200;
                    if (roll < pMid) { stateVal = 1; }
                    else { pos = "B"; stateVal = 0; }
                } else if (stateVal === 1) {
                    const pOff = 0.4 + (deptA.mid - deptB.mid) / 200;
                    if (roll < pOff) { stateVal = 2; }
                    else if (roll < pOff + 0.1) { stateVal = 3; }
                    else { pos = "B"; stateVal = 0; }
                } else if (stateVal === 2 || stateVal === 3) {
                    const baseP = stateVal === 2 ? 0.3 : 0.4;
                    const pShot = baseP + (deptA.att - deptB.def) / 200;
                    if (roll < pShot) { stateVal = 4; }
                    else { pos = "B"; stateVal = 0; }
                } else if (stateVal === 4) {
                    const pGoal = 0.15 + (deptA.att - deptB.def) / 300;
                    if (roll < pGoal) { scoreA++; }
                    pos = "B"; stateVal = 0;
                }
            } else {
                if (stateVal === 0) {
                    const pMid = 0.5 + (deptB.mid - deptA.mid) / 200;
                    if (roll < pMid) { stateVal = 1; }
                    else { pos = "A"; stateVal = 0; }
                } else if (stateVal === 1) {
                    const pOff = 0.4 + (deptB.mid - deptA.mid) / 200;
                    if (roll < pOff) { stateVal = 2; }
                    else if (roll < pOff + 0.1) { stateVal = 3; }
                    else { pos = "A"; stateVal = 0; }
                } else if (stateVal === 2 || stateVal === 3) {
                    const baseP = stateVal === 2 ? 0.3 : 0.4;
                    const pShot = baseP + (deptB.att - deptA.def) / 200;
                    if (roll < pShot) { stateVal = 4; }
                    else { pos = "A"; stateVal = 0; }
                } else if (stateVal === 4) {
                    const pGoal = 0.15 + (deptB.att - deptA.def) / 300;
                    if (roll < pGoal) { scoreB++; }
                    pos = "A"; stateVal = 0;
                }
            }
        }
        return { scoreA, scoreB };
    }

    // Pre-group teams
    const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    const groupTeamsMap = {};
    groups.forEach(g => {
        groupTeamsMap[g] = teams.filter(code => state.TEAMS_DB[code].group === g);
    });

    // Pre-build group pairings
    const groupPairings = {};
    groups.forEach(g => {
        const gt = groupTeamsMap[g];
        groupPairings[g] = [
            { a: gt[0], b: gt[1] },
            { a: gt[2], b: gt[3] },
            { a: gt[0], b: gt[2] },
            { a: gt[1], b: gt[3] },
            { a: gt[0], b: gt[3] },
            { a: gt[1], b: gt[2] }
        ];
    });

    // Statistical aggregation objects per model
    const winnersPoisson = {};
    const winnersElo = {};
    const winnersValue = {};
    const winnersBayesian = {};
    const winnersMarkov = {};

    const semifinalistsPoisson = {};
    const semifinalistsElo = {};
    const semifinalistsValue = {};
    const semifinalistsBayesian = {};
    const semifinalistsMarkov = {};

    // Other stats from Model 0 (Poisson)
    const finalMatchups = {};
    const finalScores = {};

    let simulationsDone = 0;
    let chunkSize = 2000; // process in chunks to keep UI responsive
    if (totalSimulations >= 10000000) {
        chunkSize = 50000;
    } else if (totalSimulations >= 1000000) {
        chunkSize = 10000;
    } else if (totalSimulations >= 500000) {
        chunkSize = 5000;
    }
    const startTime = performance.now();

    function processChunk() {
        const chunkLimit = Math.min(totalSimulations, simulationsDone + chunkSize);
        
        for (let s = simulationsDone; s < chunkLimit; s++) {
            // Assign model type based on user selection
            let modelType = 0;
            if (modelSelection === "poisson") {
                modelType = 0;
            } else if (modelSelection === "elo") {
                modelType = 1;
            } else if (modelSelection === "value") {
                modelType = 2;
            } else if (modelSelection === "bayesian") {
                modelType = 3;
            } else if (modelSelection === "markov") {
                modelType = 4;
            } else if (modelSelection === "consensus5") {
                modelType = s % 5;
            } else if (modelSelection === "consensus4_nofin") {
                const models4 = [0, 1, 3, 4];
                modelType = models4[s % 4];
            } else {
                modelType = s % 3;
            }

            // --- SIMULATE SINGLE TOURNAMENT ---
            
            // Standings accumulator
            const standings = {};
            groups.forEach(g => {
                standings[g] = groupTeamsMap[g].map(code => ({
                    code, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, gs: 0, gd: 0, pts: 0, fairplay: -Math.floor(Math.random() * 5)
                }));
            });

            // Initialize dynamic strengths for Bayesian updates
            const dynamicStrengths = {};
            if (modelType === 3) {
                teams.forEach(code => {
                    const baseStr = eloScores[code];
                    dynamicStrengths[code] = {
                        att_alpha: (baseStr / 50.0) * 10,
                        att_beta: 10,
                        def_alpha: (50.0 / Math.max(1, baseStr)) * 10,
                        def_beta: 10,
                        stamina: 100
                    };
                });
            }

            // Simulate group matches
            groups.forEach(g => {
                const pairings = groupPairings[g];
                const list = standings[g];

                pairings.forEach(pair => {
                    let scoreA = 0;
                    let scoreB = 0;
                    let isRealMatchPlayed = false;

                    const realMatch = state.matches ? state.matches.find(m => 
                        (m.teamA === pair.a && m.teamB === pair.b) || 
                        (m.teamA === pair.b && m.teamB === pair.a)
                    ) : null;

                    if (realMatch && realMatch.scoreA !== null && realMatch.scoreB !== null) {
                        isRealMatchPlayed = true;
                        if (realMatch.teamA === pair.a) {
                            scoreA = realMatch.scoreA;
                            scoreB = realMatch.scoreB;
                        } else {
                            scoreA = realMatch.scoreB;
                            scoreB = realMatch.scoreA;
                        }
                        
                        // Bayesian dynamic updates for real matches
                        if (modelType === 3) {
                            const sA = dynamicStrengths[pair.a];
                            const sB = dynamicStrengths[pair.b];
                            if (sA && sB) {
                                sA.att_alpha += scoreA; sA.att_beta += 1;
                                sB.def_alpha += scoreA; sB.def_beta += 1;
                                sB.att_alpha += scoreB; sB.att_beta += 1;
                                sA.def_alpha += scoreB; sA.def_beta += 1;
                                sA.stamina = Math.max(50, sA.stamina - 5);
                                sB.stamina = Math.max(50, sB.stamina - 5);
                            }
                        }
                    }

                    if (isRealMatchPlayed) {
                        // Keep these scores
                    } else if (modelType === 0) {
                        // Model 0: Poisson Dixon-Coles
                        const lams = getMatchLambdas(pair.a, pair.b);
                        scoreA = samplePoisson(lams.xgA);
                        scoreB = samplePoisson(lams.xgB);
                    } else if (modelType === 1) {
                        // Model 1: Bradley-Terry Elo Rating
                        const rA = eloScores[pair.a];
                        const rB = eloScores[pair.b];
                        const probA = Math.pow(rA / rB, 4.0);
                        const pWinA = (probA / (probA + 1.0)) * 0.74; // 26% draw rate
                        const pWinB = 0.74 - pWinA;
                        
                        const roll = Math.random();
                        if (roll < pWinA) {
                            scoreA = 1 + samplePoisson(0.7);
                            scoreB = samplePoisson(0.4);
                            if (scoreA <= scoreB) scoreA = scoreB + 1;
                        } else if (roll < 0.74) {
                            scoreB = 1 + samplePoisson(0.7);
                            scoreA = samplePoisson(0.4);
                            if (scoreB <= scoreA) scoreB = scoreA + 1;
                        } else {
                            scoreA = scoreB = samplePoisson(1.0);
                        }
                    } else if (modelType === 2) {
                        // Model 2: Bradley-Terry Financial Value
                        const vA = valueScores[pair.a];
                        const vB = valueScores[pair.b];
                        const probA = Math.pow(vA / vB, 3.5);
                        const pWinA = (probA / (probA + 1.0)) * 0.74; // 26% draw rate
                        const pWinB = 0.74 - pWinA;

                        const roll = Math.random();
                        if (roll < pWinA) {
                            scoreA = 1 + samplePoisson(0.8);
                            scoreB = samplePoisson(0.4);
                            if (scoreA <= scoreB) scoreA = scoreB + 1;
                        } else if (roll < 0.74) {
                            scoreB = 1 + samplePoisson(0.8);
                            scoreA = samplePoisson(0.4);
                            if (scoreB <= scoreA) scoreB = scoreA + 1;
                        } else {
                            scoreA = scoreB = samplePoisson(1.0);
                        }
                    } else if (modelType === 3) {
                        // Model 3: Bayesian updates
                        const sA = dynamicStrengths[pair.a];
                        const sB = dynamicStrengths[pair.b];
                        const lamA = (sA.att_alpha / sA.att_beta) * (sB.def_alpha / sB.def_beta) * (sA.stamina / 100.0) * 1.3;
                        const lamB = (sB.att_alpha / sB.att_beta) * (sA.def_alpha / sA.def_beta) * (sB.stamina / 100.0) * 1.3;
                        
                        scoreA = samplePoisson(Math.max(0.1, Math.min(8.0, lamA)));
                        scoreB = samplePoisson(Math.max(0.1, Math.min(8.0, lamB)));

                        sA.att_alpha += scoreA; sA.att_beta += 1;
                        sB.def_alpha += scoreA; sB.def_beta += 1;
                        sB.att_alpha += scoreB; sB.att_beta += 1;
                        sA.def_alpha += scoreB; sA.def_beta += 1;

                        sA.stamina = Math.max(50, sA.stamina - (3 + Math.random() * 4));
                        sB.stamina = Math.max(50, sB.stamina - (3 + Math.random() * 4));
                    } else if (modelType === 4) {
                        // Model 4: Markov Chain
                        const res = simulateMarkovMatch(pair.a, pair.b, 90);
                        scoreA = res.scoreA;
                        scoreB = res.scoreB;
                    }

                    const teamAStats = list.find(x => x.code === pair.a);
                    const teamBStats = list.find(x => x.code === pair.b);

                    teamAStats.played++;
                    teamBStats.played++;
                    teamAStats.gf += scoreA;
                    teamAStats.gs += scoreB;
                    teamBStats.gf += scoreB;
                    teamBStats.gs += scoreA;
                    teamAStats.gd = teamAStats.gf - teamAStats.gs;
                    teamBStats.gd = teamBStats.gf - teamBStats.gs;

                    if (scoreA > scoreB) {
                        teamAStats.won++; teamAStats.pts += 3; teamBStats.lost++;
                    } else if (scoreA < scoreB) {
                        teamBStats.won++; teamBStats.pts += 3; teamAStats.lost++;
                    } else {
                        teamAStats.drawn++; teamAStats.pts += 1; teamBStats.drawn++; teamBStats.pts += 1;
                    }
                });

                // Sort standings
                list.sort((x, y) => {
                    if (y.pts !== x.pts) return y.pts - x.pts;
                    if (y.gd !== x.gd) return y.gd - x.gd;
                    if (y.gf !== x.gf) return y.gf - x.gf;
                    return y.fairplay - x.fairplay;
                });
            });

            // Get best 8 third-place teams
            const allThirds = [];
            groups.forEach(g => {
                allThirds.push({ ...standings[g][2], group: g });
            });
            allThirds.sort((x, y) => {
                if (y.pts !== x.pts) return y.pts - x.pts;
                if (y.gd !== x.gd) return y.gd - x.gd;
                if (y.gf !== x.gf) return y.gf - x.gf;
                return y.fairplay - x.fairplay;
            });
            const best8Thirds = allThirds.slice(0, 8).map(t => t.code);

            const get1st = (g) => standings[g][0].code;
            const get2nd = (g) => standings[g][1].code;

            // Round of 32 slots mapping
            const t32 = [
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

            // Run Knockout stages
            function simulateKnockoutPair(teamA, teamB) {
                if (modelType === 0) {
                    const lams = getMatchLambdas(teamA, teamB);
                    let scoreA = samplePoisson(lams.xgA);
                    let scoreB = samplePoisson(lams.xgB);

                    if (scoreA === scoreB) {
                        scoreA += samplePoisson(lams.xgA / 3);
                        scoreB += samplePoisson(lams.xgB / 3);
                        if (scoreA === scoreB) {
                            return Math.random() < 0.5 ? { winner: teamA, scoreA, scoreB, isPenalties: true } : { winner: teamB, scoreA, scoreB, isPenalties: true };
                        }
                    }
                    return { winner: scoreA > scoreB ? teamA : teamB, scoreA, scoreB, isPenalties: false };
                } else if (modelType === 1) {
                    const rA = eloScores[teamA];
                    const rB = eloScores[teamB];
                    const probA = Math.pow(rA / rB, 4.5);
                    const pWinA = probA / (probA + 1.0);
                    return {
                        winner: Math.random() < pWinA ? teamA : teamB,
                        scoreA: 1, scoreB: 1, isPenalties: false
                    };
                } else if (modelType === 2) {
                    const vA = valueScores[teamA];
                    const vB = valueScores[teamB];
                    const probA = Math.pow(vA / vB, 4.0);
                    const pWinA = probA / (probA + 1.0);
                    return {
                        winner: Math.random() < pWinA ? teamA : teamB,
                        scoreA: 1, scoreB: 1, isPenalties: false
                    };
                } else if (modelType === 3) {
                    const sA = dynamicStrengths[teamA];
                    const sB = dynamicStrengths[teamB];
                    const lamA = (sA.att_alpha / sA.att_beta) * (sB.def_alpha / sB.def_beta) * (sA.stamina / 100.0) * 1.3;
                    const lamB = (sB.att_alpha / sB.att_beta) * (sA.def_alpha / sA.def_beta) * (sB.stamina / 100.0) * 1.3;

                    let scoreA = samplePoisson(Math.max(0.1, Math.min(8.0, lamA)));
                    let scoreB = samplePoisson(Math.max(0.1, Math.min(8.0, lamB)));

                    sA.att_alpha += scoreA; sA.att_beta += 1;
                    sB.def_alpha += scoreA; sB.def_beta += 1;
                    sB.att_alpha += scoreB; sB.att_beta += 1;
                    sA.def_alpha += scoreB; sA.def_beta += 1;

                    sA.stamina = Math.max(50, sA.stamina - (3 + Math.random() * 4));
                    sB.stamina = Math.max(50, sB.stamina - (3 + Math.random() * 4));

                    if (scoreA === scoreB) {
                        scoreA += samplePoisson(lamA / 3);
                        scoreB += samplePoisson(lamB / 3);
                        if (scoreA === scoreB) {
                            return Math.random() < 0.5 ? { winner: teamA, scoreA, scoreB, isPenalties: true } : { winner: teamB, scoreA, scoreB, isPenalties: true };
                        }
                    }
                    return { winner: scoreA > scoreB ? teamA : teamB, scoreA, scoreB, isPenalties: false };
                } else {
                    let { scoreA, scoreB } = simulateMarkovMatch(teamA, teamB, 90);
                    if (scoreA === scoreB) {
                        const et = simulateMarkovMatch(teamA, teamB, 30);
                        scoreA += et.scoreA;
                        scoreB += et.scoreB;
                        if (scoreA === scoreB) {
                            return Math.random() < 0.5 ? { winner: teamA, scoreA, scoreB, isPenalties: true } : { winner: teamB, scoreA, scoreB, isPenalties: true };
                        }
                    }
                    return { winner: scoreA > scoreB ? teamA : teamB, scoreA, scoreB, isPenalties: false };
                }
            }

            // Helper for live knockout check
            function getKnockoutWinner(round, matchNumber, teamA, teamB) {
                const realM = state.knockoutMatches ? state.knockoutMatches.find(m => m.round === round && m.matchNumber === matchNumber) : null;
                if (realM && realM.scoreA !== null && realM.scoreB !== null) {
                    return realM.scoreA > realM.scoreB || (realM.scoreA === realM.scoreB && realM.penaltiesWinner === "A") ? realM.teamA : realM.teamB;
                }
                return simulateKnockoutPair(teamA, teamB).winner;
            }

            // Round of 32 results -> Round of 16 slots
            const t16 = [];
            for (let i = 0; i < 16; i += 2) {
                const w1 = getKnockoutWinner("32", i + 1, t32[i].a, t32[i].b);
                const w2 = getKnockoutWinner("32", i + 2, t32[i+1].a, t32[i+1].b);
                t16.push({ a: w1, b: w2 });
            }

            // Round of 16 results -> Quarterfinals
            const t8 = [];
            for (let i = 0; i < 8; i += 2) {
                const w1 = getKnockoutWinner("16", i + 1, t16[i].a, t16[i].b);
                const w2 = getKnockoutWinner("16", i + 2, t16[i+1].a, t16[i+1].b);
                t8.push({ a: w1, b: w2 });
            }

            // Quarterfinals results -> Semifinals
            const t4 = [];
            for (let i = 0; i < 4; i += 2) {
                const w1 = getKnockoutWinner("8", i + 1, t8[i].a, t8[i].b);
                const w2 = getKnockoutWinner("8", i + 2, t8[i+1].a, t8[i+1].b);
                t4.push({ a: w1, b: w2 });
            }

            // Semifinals results -> Final
            const wFinal1 = getKnockoutWinner("4", 1, t4[0].a, t4[0].b);
            const wFinal2 = getKnockoutWinner("4", 2, t4[1].a, t4[1].b);

            // Grand Final simulation
            let finalResult;
            let winnerCode;
            const realFinal = state.knockoutMatches ? state.knockoutMatches.find(m => m.round === "2" && m.matchNumber === 1) : null;
            if (realFinal && realFinal.scoreA !== null && realFinal.scoreB !== null) {
                winnerCode = realFinal.scoreA > realFinal.scoreB || (realFinal.scoreA === realFinal.scoreB && realFinal.penaltiesWinner === "A") ? realFinal.teamA : realFinal.teamB;
                finalResult = {
                    winner: winnerCode,
                    scoreA: realFinal.scoreA,
                    scoreB: realFinal.scoreB,
                    isPenalties: realFinal.scoreA === realFinal.scoreB
                };
            } else {
                finalResult = simulateKnockoutPair(wFinal1, wFinal2);
                winnerCode = finalResult.winner;
            }
            
            // --- AGGREGATE FINAL DATA ---
            const runnerUpCode = winnerCode === wFinal1 ? wFinal2 : wFinal1;

            const winnerName = state.TEAMS_DB[winnerCode].name;
            const runnerUpName = state.TEAMS_DB[runnerUpCode].name;

            // Record semifinalists
            const semis = [t4[0].a, t4[0].b, t4[1].a, t4[1].b];
            semis.forEach(code => {
                const name = state.TEAMS_DB[code].name;
                if (modelType === 0) {
                    semifinalistsPoisson[name] = (semifinalistsPoisson[name] || 0) + 1;
                } else if (modelType === 1) {
                    semifinalistsElo[name] = (semifinalistsElo[name] || 0) + 1;
                } else if (modelType === 2) {
                    semifinalistsValue[name] = (semifinalistsValue[name] || 0) + 1;
                } else if (modelType === 3) {
                    semifinalistsBayesian[name] = (semifinalistsBayesian[name] || 0) + 1;
                } else if (modelType === 4) {
                    semifinalistsMarkov[name] = (semifinalistsMarkov[name] || 0) + 1;
                }
            });

            // Record winner counts based on model type
            if (modelType === 0) {
                winnersPoisson[winnerName] = (winnersPoisson[winnerName] || 0) + 1;
                
                // Matchup frequencies and exact scores are logged from Poisson model only
                const matchup = [winnerName, runnerUpName].sort().join(" vs ");
                finalMatchups[matchup] = (finalMatchups[matchup] || 0) + 1;

                const winScore = winnerCode === wFinal1 ? finalResult.scoreA : finalResult.scoreB;
                const loseScore = winnerCode === wFinal1 ? finalResult.scoreB : finalResult.scoreA;
                const scoreLabel = finalResult.isPenalties ? `${winScore}-${loseScore} (dcr)` : `${winScore}-${loseScore}`;
                finalScores[scoreLabel] = (finalScores[scoreLabel] || 0) + 1;
            } else if (modelType === 1) {
                winnersElo[winnerName] = (winnersElo[winnerName] || 0) + 1;
            } else if (modelType === 2) {
                winnersValue[winnerName] = (winnersValue[winnerName] || 0) + 1;
            } else if (modelType === 3) {
                winnersBayesian[winnerName] = (winnersBayesian[winnerName] || 0) + 1;
            } else if (modelType === 4) {
                winnersMarkov[winnerName] = (winnersMarkov[winnerName] || 0) + 1;
            }
        }

        simulationsDone = chunkLimit;
        
        // Progress callback
        const pct = Math.round((simulationsDone / totalSimulations) * 100);
        const elapsed = (performance.now() - startTime) / 1000;
        const rate = simulationsDone / elapsed;
        const remaining = (totalSimulations - simulationsDone) / rate;

        onProgress(simulationsDone, pct, elapsed.toFixed(1), remaining.toFixed(1));

        if (simulationsDone < totalSimulations) {
            setTimeout(processChunk, 1);
        } else {
            // Count total simulations run per model
            let nPoisson = 0;
            let nElo = 0;
            let nValue = 0;
            let nBayesian = 0;
            let nMarkov = 0;

            if (modelSelection === "poisson") {
                nPoisson = totalSimulations;
            } else if (modelSelection === "elo") {
                nElo = totalSimulations;
            } else if (modelSelection === "value") {
                nValue = totalSimulations;
            } else if (modelSelection === "bayesian") {
                nBayesian = totalSimulations;
            } else if (modelSelection === "markov") {
                nMarkov = totalSimulations;
            } else if (modelSelection === "consensus5") {
                nPoisson = Math.floor(totalSimulations / 5) + (totalSimulations % 5 > 0 ? 1 : 0);
                nElo = Math.floor(totalSimulations / 5) + (totalSimulations % 5 > 1 ? 1 : 0);
                nValue = Math.floor(totalSimulations / 5) + (totalSimulations % 5 > 2 ? 1 : 0);
                nBayesian = Math.floor(totalSimulations / 5) + (totalSimulations % 5 > 3 ? 1 : 0);
                nMarkov = Math.floor(totalSimulations / 5);
            } else if (modelSelection === "consensus4_nofin") {
                nPoisson = Math.floor(totalSimulations / 4) + (totalSimulations % 4 > 0 ? 1 : 0);
                nElo = Math.floor(totalSimulations / 4) + (totalSimulations % 4 > 1 ? 1 : 0);
                nValue = 0;
                nBayesian = Math.floor(totalSimulations / 4) + (totalSimulations % 4 > 2 ? 1 : 0);
                nMarkov = Math.floor(totalSimulations / 4);
            } else {
                nPoisson = Math.floor(totalSimulations / 3) + (totalSimulations % 3 > 0 ? 1 : 0);
                nElo = Math.floor(totalSimulations / 3) + (totalSimulations % 3 > 1 ? 1 : 0);
                nValue = Math.floor(totalSimulations / 3);
            }

            // Compute merged consensus statistics
            const uniqueWinners = new Set([
                ...Object.keys(winnersPoisson),
                ...Object.keys(winnersElo),
                ...Object.keys(winnersValue),
                ...Object.keys(winnersBayesian),
                ...Object.keys(winnersMarkov)
            ]);

            const sortedConsensus = Array.from(uniqueWinners).map(name => {
                const countPoisson = winnersPoisson[name] || 0;
                const countElo = winnersElo[name] || 0;
                const countValue = winnersValue[name] || 0;
                const countBayesian = winnersBayesian[name] || 0;
                const countMarkov = winnersMarkov[name] || 0;

                const pctPoisson = nPoisson > 0 ? (countPoisson / nPoisson) * 100 : 0;
                const pctElo = nElo > 0 ? (countElo / nElo) * 100 : 0;
                const pctValue = nValue > 0 ? (countValue / nValue) * 100 : 0;
                const pctBayesian = nBayesian > 0 ? (countBayesian / nBayesian) * 100 : 0;
                const pctMarkov = nMarkov > 0 ? (countMarkov / nMarkov) * 100 : 0;
                
                let pctConsensus = 0;
                if (modelSelection === "poisson") {
                    pctConsensus = pctPoisson;
                } else if (modelSelection === "elo") {
                    pctConsensus = pctElo;
                } else if (modelSelection === "value") {
                    pctConsensus = pctValue;
                } else if (modelSelection === "bayesian") {
                    pctConsensus = pctBayesian;
                } else if (modelSelection === "markov") {
                    pctConsensus = pctMarkov;
                } else if (modelSelection === "consensus5") {
                    pctConsensus = (pctPoisson + pctElo + pctValue + pctBayesian + pctMarkov) / 5;
                } else if (modelSelection === "consensus4_nofin") {
                    pctConsensus = (pctPoisson + pctElo + pctBayesian + pctMarkov) / 4;
                } else {
                    pctConsensus = (pctPoisson + pctElo + pctValue) / 3;
                }

                return {
                    name,
                    pctPoisson: pctPoisson.toFixed(2),
                    pctElo: pctElo.toFixed(2),
                    pctValue: pctValue.toFixed(2),
                    pctBayesian: pctBayesian.toFixed(2),
                    pctMarkov: pctMarkov.toFixed(2),
                    pctConsensus: pctConsensus.toFixed(2)
                };
            }).sort((x, y) => parseFloat(y.pctConsensus) - parseFloat(x.pctConsensus));

            // Select active winners map for winners list display
            let activeWinnersMap = winnersPoisson;
            let activeN = nPoisson;
            if (modelSelection === "elo") {
                activeWinnersMap = winnersElo;
                activeN = nElo;
            } else if (modelSelection === "value") {
                activeWinnersMap = winnersValue;
                activeN = nValue;
            } else if (modelSelection === "bayesian") {
                activeWinnersMap = winnersBayesian;
                activeN = nBayesian;
            } else if (modelSelection === "markov") {
                activeWinnersMap = winnersMarkov;
                activeN = nMarkov;
            }

            const sortedWinners = Object.keys(activeWinnersMap)
                .map(name => ({ name, count: activeWinnersMap[name], pct: activeN > 0 ? ((activeWinnersMap[name] / activeN) * 100).toFixed(2) : "0.00" }))
                .sort((x, y) => y.count - x.count);

            // Collate active semifinalists
            let activeSemisMap = semifinalistsPoisson;
            let activeSemisN = nPoisson;
            if (modelSelection === "elo") {
                activeSemisMap = semifinalistsElo;
                activeSemisN = nElo;
            } else if (modelSelection === "value") {
                activeSemisMap = semifinalistsValue;
                activeSemisN = nValue;
            } else if (modelSelection === "bayesian") {
                activeSemisMap = semifinalistsBayesian;
                activeSemisN = nBayesian;
            } else if (modelSelection === "markov") {
                activeSemisMap = semifinalistsMarkov;
                activeSemisN = nMarkov;
            }

            const sortedSemis = Object.keys(activeSemisMap)
                .map(name => ({ name, count: activeSemisMap[name], pct: activeSemisN > 0 ? ((activeSemisMap[name] / activeSemisN) * 100).toFixed(2) : "0.00" }))
                .sort((x, y) => y.count - x.count);

            // Compute merged consensus statistics for reaching semifinals
            const uniqueSemis = new Set([
                ...Object.keys(semifinalistsPoisson),
                ...Object.keys(semifinalistsElo),
                ...Object.keys(semifinalistsValue),
                ...Object.keys(semifinalistsBayesian),
                ...Object.keys(semifinalistsMarkov)
            ]);

            const sortedConsensusSemis = Array.from(uniqueSemis).map(name => {
                const countPoisson = semifinalistsPoisson[name] || 0;
                const countElo = semifinalistsElo[name] || 0;
                const countValue = semifinalistsValue[name] || 0;
                const countBayesian = semifinalistsBayesian[name] || 0;
                const countMarkov = semifinalistsMarkov[name] || 0;

                const pctPoisson = nPoisson > 0 ? (countPoisson / nPoisson) * 100 : 0;
                const pctElo = nElo > 0 ? (countElo / nElo) * 100 : 0;
                const pctValue = nValue > 0 ? (countValue / nValue) * 100 : 0;
                const pctBayesian = nBayesian > 0 ? (countBayesian / nBayesian) * 100 : 0;
                const pctMarkov = nMarkov > 0 ? (countMarkov / nMarkov) * 100 : 0;
                
                let pctConsensus = 0;
                if (modelSelection === "poisson") {
                    pctConsensus = pctPoisson;
                } else if (modelSelection === "elo") {
                    pctConsensus = pctElo;
                } else if (modelSelection === "value") {
                    pctConsensus = pctValue;
                } else if (modelSelection === "bayesian") {
                    pctConsensus = pctBayesian;
                } else if (modelSelection === "markov") {
                    pctConsensus = pctMarkov;
                } else if (modelSelection === "consensus5") {
                    pctConsensus = (pctPoisson + pctElo + pctValue + pctBayesian + pctMarkov) / 5;
                } else if (modelSelection === "consensus4_nofin") {
                    pctConsensus = (pctPoisson + pctElo + pctBayesian + pctMarkov) / 4;
                } else {
                    pctConsensus = (pctPoisson + pctElo + pctValue) / 3;
                }

                return {
                    name,
                    pctPoisson: pctPoisson.toFixed(2),
                    pctElo: pctElo.toFixed(2),
                    pctValue: pctValue.toFixed(2),
                    pctBayesian: pctBayesian.toFixed(2),
                    pctMarkov: pctMarkov.toFixed(2),
                    pctConsensus: pctConsensus.toFixed(2)
                };
            }).sort((x, y) => parseFloat(y.pctConsensus) - parseFloat(x.pctConsensus));

            const sortedMatchups = Object.keys(finalMatchups)
                .map(name => ({ name, count: finalMatchups[name], pct: nPoisson > 0 ? ((finalMatchups[name] / nPoisson) * 100).toFixed(2) : "0.00" }))
                .sort((x, y) => y.count - x.count);

            const sortedScores = Object.keys(finalScores)
                .map(name => ({ name, count: finalScores[name], pct: nPoisson > 0 ? ((finalScores[name] / nPoisson) * 100).toFixed(2) : "0.00" }))
                .sort((x, y) => y.count - x.count);

            onComplete({
                total: totalSimulations,
                modelSelection: modelSelection,
                elapsed: elapsed.toFixed(2),
                consensus: sortedConsensus,
                winners: sortedWinners,
                semifinalists: sortedSemis,
                semisConsensus: sortedConsensusSemis,
                matchups: sortedMatchups,
                scores: sortedScores
            });
        }
    }

    // Start simulation loop
    setTimeout(processChunk, 1);
}

export function runHistoricalBacktest(year, totalSimulations, onProgress, onComplete) {
    fetch('data/stats/historical_tournaments.json')
        .then(res => res.json())
        .then(data => {
            const tournament = data[year];
            if (!tournament) {
                onComplete(null);
                return;
            }
            executeBacktest(year, tournament, totalSimulations, onProgress, onComplete);
        })
        .catch(err => {
            console.error("Errore nel caricamento del database storico:", err);
            onComplete(null);
        });
}

function executeBacktest(year, tournament, totalSimulations, onProgress, onComplete) {
    const teams = tournament.teams;
    const teamCodes = Object.keys(teams);
    const actualMatches = tournament.matches;

    // Calculate predicted probabilities for Brier Score
    const matchOddsList = actualMatches.map(m => {
        const tA = teams[m.teamA];
        const tB = teams[m.teamB];
        if (!tA || !tB) return { pctA: 0.33, pctX: 0.34, pctB: 0.33 };

        const ratingA = tA.baseStrength;
        const ratingB = tB.baseStrength;
        const valA = tA.squadValue || 50000000;
        const valB = tB.squadValue || 50000000;

        // Model 1: Poisson
        const lambdaA = 1.25 * Math.pow(1.02, ratingA - ratingB) * Math.pow(valA / valB, 0.05);
        const lambdaB = 1.25 * Math.pow(1.02, ratingB - ratingA) * Math.pow(valB / valA, 0.05);
        
        let pPoissonA = 0, pPoissonX = 0, pPoissonB = 0;
        for (let i = 0; i <= 6; i++) {
            for (let j = 0; j <= 6; j++) {
                const prob = calculatePoissonProbability(lambdaA, i) * calculatePoissonProbability(lambdaB, j);
                if (i > j) pPoissonA += prob;
                else if (i === j) pPoissonX += prob;
                else pPoissonB += prob;
            }
        }
        const sumPoisson = pPoissonA + pPoissonX + pPoissonB;
        const p1 = sumPoisson > 0 ? pPoissonA / sumPoisson : 0.33;
        const pX = sumPoisson > 0 ? pPoissonX / sumPoisson : 0.34;
        const p2 = sumPoisson > 0 ? pPoissonB / sumPoisson : 0.33;

        // Model 2: ELO Bradley-Terry
        const probEloA = Math.pow(ratingA / ratingB, 4.0);
        const pEloA = (probEloA / (probEloA + 1.0)) * 0.74;
        const pEloB = 0.74 - pEloA;
        const pEloX = 0.26;

        // Model 3: Value Bradley-Terry
        const vA = Math.pow(valA, 0.25);
        const vB = Math.pow(valB, 0.25);
        const probValA = Math.pow(vA / vB, 3.5);
        const pValA = (probValA / (probValA + 1.0)) * 0.74;
        const pValB = 0.74 - pValA;
        const pValX = 0.26;

        return {
            pctA: (p1 + pEloA + pValA) / 3,
            pctX: (pX + pEloX + pValX) / 3,
            pctB: (p2 + pEloB + pValB) / 3
        };
    });

    // Calculate Brier Score
    let brierSum = 0;
    actualMatches.forEach((m, idx) => {
        const odds = matchOddsList[idx];
        let oA = 0, oX = 0, oB = 0;
        if (m.scoreA > m.scoreB) oA = 1;
        else if (m.scoreA < m.scoreB) oB = 1;
        else oX = 1;

        brierSum += Math.pow(odds.pctA - oA, 2) + Math.pow(odds.pctX - oX, 2) + Math.pow(odds.pctB - oB, 2);
    });
    const brierScore = brierSum / actualMatches.length;

    // Simulation accumulators
    const winnersCount = {};
    const semisCount = {};
    teamCodes.forEach(code => {
        winnersCount[code] = 0;
        semisCount[code] = 0;
    });

    const groupsList = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const groupTeams = {};
    groupsList.forEach(g => {
        groupTeams[g] = teamCodes.filter(c => teams[c].group === g);
    });

    let simsDone = 0;
    const chunkSize = 10000;
    const startTime = performance.now();

    function processChunk() {
        const limit = Math.min(totalSimulations, simsDone + chunkSize);
        for (let s = simsDone; s < limit; s++) {
            const standings = {};
            groupsList.forEach(g => {
                standings[g] = groupTeams[g].map(c => ({
                    code: c, pts: 0, gd: 0, gf: 0, fairplay: Math.random()
                }));
            });

            // Simulate group stage
            groupsList.forEach(g => {
                const list = standings[g];
                const pairings = [
                    { i: 0, j: 1 }, { i: 2, j: 3 },
                    { i: 0, j: 2 }, { i: 1, j: 3 },
                    { i: 0, j: 3 }, { i: 1, j: 2 }
                ];
                pairings.forEach(p => {
                    const codeA = list[p.i].code;
                    const codeB = list[p.j].code;
                    const ratingA = teams[codeA].baseStrength;
                    const ratingB = teams[codeB].baseStrength;
                    const valA = teams[codeA].squadValue || 50000000;
                    const valB = teams[codeB].squadValue || 50000000;

                    const lambdaA = 1.25 * Math.pow(1.02, ratingA - ratingB) * Math.pow(valA / valB, 0.05);
                    const lambdaB = 1.25 * Math.pow(1.02, ratingB - ratingA) * Math.pow(valB / valA, 0.05);

                    const scoreA = samplePoisson(lambdaA);
                    const scoreB = samplePoisson(lambdaB);

                    list[p.i].gf += scoreA;
                    list[p.i].gs += scoreB;
                    list[p.j].gf += scoreB;
                    list[p.j].gs += scoreA;
                    list[p.i].gd += (scoreA - scoreB);
                    list[p.j].gd += (scoreB - scoreA);

                    if (scoreA > scoreB) {
                        list[p.i].pts += 3;
                    } else if (scoreA < scoreB) {
                        list[p.j].pts += 3;
                    } else {
                        list[p.i].pts += 1;
                        list[p.j].pts += 1;
                    }
                });

                list.sort((x, y) => {
                    if (y.pts !== x.pts) return y.pts - x.pts;
                    if (y.gd !== x.gd) return y.gd - x.gd;
                    if (y.gf !== x.gf) return y.gf - x.gf;
                    return y.fairplay - x.fairplay;
                });
            });

            const get1st = (g) => standings[g][0].code;
            const get2nd = (g) => standings[g][1].code;

            const t16 = [
                { a: get1st("A"), b: get2nd("B") },
                { a: get1st("C"), b: get2nd("D") },
                { a: get1st("E"), b: get2nd("F") },
                { a: get1st("G"), b: get2nd("H") },
                { a: get1st("B"), b: get2nd("A") },
                { a: get1st("D"), b: get2nd("C") },
                { a: get1st("F"), b: get2nd("E") },
                { a: get1st("H"), b: get2nd("G") }
            ];

            function simulateKo(codeA, codeB) {
                const ratingA = teams[codeA].baseStrength;
                const ratingB = teams[codeB].baseStrength;
                const valA = teams[codeA].squadValue || 50000000;
                const valB = teams[codeB].squadValue || 50000000;

                const lambdaA = 1.25 * Math.pow(1.02, ratingA - ratingB) * Math.pow(valA / valB, 0.05);
                const lambdaB = 1.25 * Math.pow(1.02, ratingB - ratingA) * Math.pow(valB / valA, 0.05);

                let scoreA = samplePoisson(lambdaA);
                let scoreB = samplePoisson(lambdaB);
                if (scoreA === scoreB) {
                    scoreA += samplePoisson(lambdaA / 3);
                    scoreB += samplePoisson(lambdaB / 3);
                    if (scoreA === scoreB) {
                        return Math.random() < 0.5 ? codeA : codeB;
                    }
                }
                return scoreA > scoreB ? codeA : codeB;
            }

            const w16 = [];
            for (let i = 0; i < 8; i++) {
                w16.push(simulateKo(t16[i].a, t16[i].b));
            }

            const w8 = [
                simulateKo(w16[0], w16[1]),
                simulateKo(w16[2], w16[3]),
                simulateKo(w16[4], w16[5]),
                simulateKo(w16[6], w16[7])
            ];

            const w4 = [
                simulateKo(w8[0], w8[1]),
                simulateKo(w8[2], w8[3])
            ];
            
            semisCount[w8[0]]++;
            semisCount[w8[1]]++;
            semisCount[w8[2]]++;
            semisCount[w8[3]]++;

            const champion = simulateKo(w4[0], w4[1]);
            winnersCount[champion]++;
        }

        simsDone = limit;
        const pct = Math.round((simsDone / totalSimulations) * 100);
        onProgress(simsDone, pct);

        if (simsDone < totalSimulations) {
            setTimeout(processChunk, 1);
        } else {
            const sortedWinners = Object.keys(winnersCount).map(c => ({
                code: c,
                name: teams[c].name,
                count: winnersCount[c],
                pct: ((winnersCount[c] / totalSimulations) * 100).toFixed(3)
            })).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

            const sortedSemis = Object.keys(semisCount).map(c => ({
                code: c,
                name: teams[c].name,
                count: semisCount[c],
                pct: ((semisCount[c] / totalSimulations) * 100).toFixed(3)
            })).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

            const actualChampionRank = sortedWinners.findIndex(x => x.code === tournament.champion) + 1;
            const actualChampionPct = sortedWinners.find(x => x.code === tournament.champion)?.pct || "0.000";

            onComplete({
                year,
                brierScore: brierScore.toFixed(4),
                actualChampion: teams[tournament.champion].name,
                actualChampionCode: tournament.champion,
                championRank: actualChampionRank,
                championPct: actualChampionPct,
                winners: sortedWinners,
                semis: sortedSemis,
                elapsed: ((performance.now() - startTime) / 1000).toFixed(2)
            });
        }
    }

    setTimeout(processChunk, 1);
}
