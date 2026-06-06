# Project: World Cup 2026 Simulator & Betting Advisor

## Architecture
The application is a client-side Single Page Application (SPA) designed to simulate the FIFA World Cup 2026, compute match odds, and manage team lineups. It integrates 4 predictive models:
1. **GBDT + Bivariate Poisson**: Pre-calculated expected goals ($\lambda_A, \lambda_B$) and bivariate correlation ($\gamma$) updated client-side by active lineups.
2. **Dynamic Bayesian updates**: Conjugate Gamma-Poisson updates of team strength parameters ($\alpha, \beta$) updated live after each tournament match, including stamina and fatigue.
3. **Markov Chain Simulator**: A 5-state pitch control simulator generating detailed events minute-by-minute.
4. **Agent-Based Model (ABM)**: Interactive 2D Canvas simulation at 30fps+ for single match simulations with 22 autonomous agents.

### Code Layout
- `index.html` - Main UI layout
- `style.css` - Styles sheet
- `js/state.js` - Global state and LocalStorage persistence
- `js/config.js` - Constant parameters and coefficients
- `js/engine.js` - Core math, odds calculations, and tournament progression
- `js/simulator.js` - Simulation engines (Monte Carlo, Markov Chain, Bayesian updates)
- `js/ui.js` - View rendering, Canvas ABM modal, event timeline
- `js/events.js` - Event handlers and routing
- `scratch/train_gbdt.py` - Python script for training GBDT model
- `data/stats/gbdt_baselines.json` - GBDT predicted baseline coefficients

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | GBDT Training | Python GBDT training script and exporting baseline JSON | none | PLANNED |
| 2 | GBDT Integration | Load baselines in JS, dynamic lineup interpolation, show in UI comparison | M1 | PLANNED |
| 3 | Bayesian Update | Gamma-Poisson updates in simulator, stamina decay, UI display of fatigue | none | PLANNED |
| 4 | Markov Chain Engine | 5-state Markov chain match simulation and event logs in UI and Monte Carlo | none | PLANNED |
| 5 | Canvas ABM | 2D HTML5 Canvas interactive single match simulation, persistence of result | none | PLANNED |
| 6 | E2E Verification | Verification of all models, tests, layout and integrity | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts
### GBDT Baselines format (`data/stats/gbdt_baselines.json`)
```json
{
  "MEX_USA": { "lambdaA": 1.25, "lambdaB": 1.10, "gamma": -0.05 },
  ...
}
```

### Bayesian Team Parameters (`js/simulator.js` & `js/state.js`)
- Each team has `alpha_att`, `beta_att`, `alpha_def`, `beta_def` in its state, initialized at start of tournament.
- Stamina / physical decay tracks `minutesPlayed` and `injuries` for each player, affecting team's Gamma parameters.

### Markov Chain States
- States: `CONSTRUCTION` (1), `MIDFIELD` (2), `ATTACK` (3), `SET_PIECE` (4), `SHOT` (5)
- Transition matrix computed dynamically from lineup comparison.

### ABM Agent Attributes
- 22 agents (11 vs 11) with position coordinates `(x, y)` and attributes (speed, pass, shoot, intercept).
