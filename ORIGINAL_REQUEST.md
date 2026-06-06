# Original User Request

## Initial Request — 2026-06-04T13:13:07+02:00

Questo progetto ha uno scopo puramente scientifico di valutazione, con priorità assoluta sulla precisione algoritmica statistica e sulla robustezza dei calcoli matematici per l'integrazione di 4 modelli predittivi avanzati (GBDT, Bayesiano Dinamico, Catene di Markov/Event-Based e ABM).

Working directory: c:\Users\betaland operatore\Documents\Mondiali
Integrity mode: demo

## Requirements

### R1. Modello GBDT + Bivariate Poisson (L'approccio Zeileis)
- Creare uno script di addestramento in Python (`scratch/train_gbdt.py`) che utilizzi un modello GBDT (come XGBoost o LightGBM) per predire i coefficienti di expected goals ($\lambda_1, \lambda_2$) e la correlazione bivariata ($\gamma$) tra ogni coppia di nazionali, basandosi sui dati storici e sui valori rosa di Transfermarkt.
- Esportare questi coefficienti in un file JSON statico (`data/stats/gbdt_baselines.json`).
- Modificare il codice client-side in `js/engine.js` per caricare questo JSON ed interpolare dinamicamente i coefficienti correggendoli in base al rating effettivo della lineup dei titolari attivi rispetto alla media del team.

### R2. Aggiornamenti Bayesiani Dinamici (Bayesian Updating)
- Implementare un modello analitico coniugato Gamma-Poisson client-side in `js/simulator.js` per aggiornare i parametri ($\alpha, \beta$) della forza attacco/difesa di ogni nazionale durante lo svolgimento del torneo.
- Aggiornare i valori dopo ogni partita giocata nel torneo, riflettendo lo stato di forma corrente per il match successivo.
- Integrare un fattore dinamico di stamina e decadimento fisico (minuti giocati e infortuni accumulati) che influenzi negativamente i parametri della Gamma.

### R3. Catena di Markov / Pitch Control Event-Based
- Sviluppare un motore di simulazione basato su una Catena di Markov a 5 stati (Costruzione, Sviluppo Centrocampo, Attacco Terzo Offensivo, Calcio Piazzato, Tiro in Porta) in `js/simulator.js`.
- Le probabilità di transizione tra gli stati devono essere calcolate dinamicamente dal confronto dei reparti delle due lineup (es. centrocampo vs centrocampo).
- Generare log degli eventi dettagliati minuto per minuto (marcatori, tiri, falli, cartellini, infortuni) per ogni partita simulata con questo metodo.

### R4. Agent-Based Modeling (ABM) con Canvas 2D per Singolo Match
- Implementare in `js/ui.js` un modal di simulazione interattivo renderizzato su un elemento HTML5 `<canvas>` a 30fps+ che si attiva solo per le simulazioni dei singoli match.
- Simulare 22 agenti indipendenti che si muovono sul campo virtuale seguendo semplici alberi decisionali (passaggio, corsa nello spazio, intercettazione, tiro) guidati dai loro attributi individuali definiti in `TEAMS_DB`.
- Registrare il risultato esatto e gli eventi generati dall'ABM nello stato generale al termine della partita sul canvas.

## Acceptance Criteria

### Funzionalità GBDT
- [ ] Presenza dello script `scratch/train_gbdt.py` funzionante.
- [ ] Il motore JS calcola le quote GBDT e le include nella tabella di confronto multimodello.

### Funzionalità Bayesiana
- [ ] Durante lo svolgimento del torneo, i parametri Gamma delle squadre variano coerentemente con i gol fatti/subiti e si resettano correttamente all'avvio di un nuovo torneo.
- [ ] La UI mostra le variazioni di forma e affaticamento delle nazionali nei dettagli del match.

### Funzionalità Catena di Markov
- [ ] Il simulatore massivo Monte Carlo supporta il modello a catena di Markov e completa le simulazioni con successo ad alta velocità.
- [ ] La UI del singolo match mostra la cronologia degli eventi minuto per minuto generati dal modello.

### Funzionalità Canvas ABM
- [ ] Facendo clic su "Simula" su un singolo incontro, viene aperto un modal con il Canvas 2D interattivo che riproduce graficamente il comportamento dei 22 agenti.
- [ ] Al termine della simulazione sul canvas, il risultato e i marcatori vengono persistiti correttamente nello stato locale.
