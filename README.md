# 🏆 World Cup 2026 Simulator & Betting Advisor

Un'applicazione web client-side per simulare i Mondiali FIFA 2026, calcolare quote e studiare probabilità tramite un modello di Poisson combinato con dati testa a testa (H2H) storici e metricheStatsBomb.

## 🚀 Caratteristiche Principali

- **Simulatore Completo**: Gestisci ed inserisci i punteggi per la fase a gironi (Gruppi A-L) e le fasi finali (dal Round of 32 alla Finale).
- **Algoritmo Betting Poisson**: Calcola le probabilità relative (1X2, Under/Over 2.5, Goal/No Goal) e quote eque basate sulla forza dei reparti dei convocati di ciascuna nazionale.
- **Valore Economico Rose**: Integrazione dinamica dei valori di mercato di Transfermarkt per scalare il tasso di gol attesi (xG).
- **Archivio Storico & H2H**: Statistiche testa a testa storiche (dal 1872) incorporate per raffinare le quote tramite blending Bayesiano.
- **Metriche Avanzate StatsBomb**: Integrazione side-by-side di metriche di gioco reali come possesso palla medio, precisione passaggi, e xG per incontro.

## 📂 Struttura del Progetto

```
Mondiali/
├── data/
│   ├── stats/                  # Dataset storici aggregati (JSON)
│   └── teams.json              # Database delle nazionali e giocatori (estratto)
├── js/                         # Moduli JavaScript (ES6)
│   ├── config.js               # Parametri costanti e pesi dell'algoritmo
│   ├── state.js                # Gestione dello stato e persistenza in LocalStorage
│   ├── engine.js               # Calcolo quote (Poisson) e progressione gironi/knockout
│   ├── ui.js                   # Rendering delle schede e dell'albero grafico
│   ├── events.js               # Gestione degli eventi ed Event Delegation
│   └── main.js                 # Bootstrapping dell'applicazione
├── scratch/
│   └── crunch_archives.py      # Pipeline ETL Python per rigenerare i dati statistici
├── index.html                  # Shell SPA dell'applicazione
├── style.css                   # Fogli di stile completi e responsive
├── server.js                   # Server HTTP Node.js statico e sicuro
└── package.json                # Configurazione del progetto e script
```

## 🛠️ Come Avviare il Progetto

### Avvio Server
L'applicazione necessita di un server HTTP locale a causa dell'utilizzo di ES Modules nativi nel browser. È possibile avviarlo usando Node.js:

```bash
npm run start
# Oppure
node server.js
```

Il server sarà accessibile su `http://localhost:8080/`.

### Esecuzione ETL (Python)
Se si desidera ri-calcolare o aggiornare i file JSON statistici a partire dai CSV storici grezzi (disponibili nelle cartelle `archive`), è possibile eseguire:

```bash
npm run etl
```

*Nota: richiede Python 3 ed il pacchetto `pandas` installato.*
