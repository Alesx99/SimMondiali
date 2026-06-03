// Application Constants and Settings
export const GROUP_STAGE_DATES = [
    "11 Giugno 2026", "12 Giugno 2026", "13 Giugno 2026", "14 Giugno 2026", 
    "15 Giugno 2026", "16 Giugno 2026", "17 Giugno 2026", "18 Giugno 2026",
    "19 Giugno 2026", "20 Giugno 2026", "21 Giugno 2026", "22 Giugno 2026",
    "23 Giugno 2026", "24 Giugno 2026", "25 Giugno 2026", "26 Giugno 2026",
    "27 Giugno 2026"
];

export const CONFIG = {
    hostBonus: 1.08,             // 8% performance boost for hosts (MEX, USA, CAN)
    baseGoalsWCFallback: 2.65,    // Fallback avg goals per game in World Cup if json load fails
    maxPoissonGoals: 10,         // Maximum goals in distribution
    maxOddValue: 100.00,         // Maximum capped odds
    minOddValue: 1.01,           // Minimum capped odds
    minProbForOdds: 1,           // 1% minimum probability to avoid division by zero or extreme odds
    h2hWeightMax: 0.16           // Maximum weight for H2H history (up to 16%)
};
