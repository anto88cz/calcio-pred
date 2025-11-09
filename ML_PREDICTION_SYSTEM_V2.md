# Sistema di Predizione ML - Documentazione Completa

## 📋 Panoramica

È stato implementato un nuovo sistema di predizione basato su **Machine Learning** che analizza partite di calcio utilizzando tre fonti di dati principali:

1. **Storico Testa a Testa (Head-to-Head)**
2. **Statistiche Stagionali delle Squadre**
3. **Expected Goals (xG) e Expected Goals Against (xGA)**

Il sistema sostituisce la vecchia pagina `/analysis` con una nuova pagina `/prediction` che fornisce predizioni più accurate e dettagliate.

---

## 🏗️ Architettura

### Backend

#### 1. **Data Fetcher Service** (`api/src/services/ml-prediction/data-fetcher.service.ts`)

Recupera i dati dalle API Sportmonks:

- **Head-to-Head**: `GET /fixtures/head-to-head/{homeTeamId}/{awayTeamId}`
  - Storico completo delle partite tra due squadre
  - Risultati, gol segnati e subiti
  
- **Statistiche Stagionali**: `GET /teams/seasons/{seasonId}`
  - Media gol segnati/subiti
  - Percentuale vittorie
  - Tiri in porta, corner, falli, cartellini
  
- **Dati xG**: `GET /fixtures/{fixtureId}` e ricerche per squadra
  - Expected Goals delle ultime 10 partite
  - xG differenziale (xG - xGA)

#### 2. **ML Algorithm Service** (`api/src/services/ml-prediction/ml-algorithm.service.ts`)

Algoritmo di predizione che:

1. **Analizza i dati H2H**:
   - Calcola percentuali di vittoria casa/pareggio/trasferta
   - Media gol casa e trasferta
   - Peso basato sul numero di partite disponibili

2. **Analizza statistiche stagionali**:
   - Calcola "forza" delle squadre (0-100)
   - Considera attacco, difesa e win rate
   - Applica vantaggio casalingo (+10%)

3. **Analizza dati xG**:
   - Media xG e xGA delle ultime partite
   - xG differenziale per valutare forma offensiva/difensiva

4. **Combina i fattori con pesi dinamici**:
   - H2H: peso 0-30% (aumenta con più dati)
   - Statistiche: peso 20-40%
   - xG: peso 10-30%
   - Normalizzazione per somma 100%

5. **Genera predizioni**:
   - Probabilità 1X2 (casa/pareggio/trasferta)
   - Punteggio atteso
   - Livello di confidence (0-100%)
   - Analisi vantaggi per ogni fattore

#### 3. **API Routes** (`api/src/routes/ml-prediction.routes.ts`)

Nuovi endpoint:

- `POST /api/ml-prediction`: Genera predizione ML
  ```json
  {
    "fixtureId": 19424971,
    "homeTeamId": 625,
    "awayTeamId": 613,
    "seasonId": 25533,
    "leagueId": 384,
    "homeTeamName": "Juventus",
    "awayTeamName": "Torino"
  }
  ```

- `GET /api/ml-prediction/:fixtureId`: Recupera predizione dalla cache

---

### Frontend

#### 1. **Pagina Prediction** (`frontend/src/app/prediction/page.tsx`)

Nuova pagina che sostituisce `/analysis` per le predizioni ML.

#### 2. **Prediction Content** (`frontend/src/app/prediction/PredictionContent.tsx`)

Componente React con UI moderna che mostra:

- **Header Match**: Nome squadre con icone casa/trasferta
- **Badge Confidence**: Livello di affidabilità della predizione
- **Probabilità 1X2**: Card con percentuali per casa/pareggio/trasferta (evidenzia la più probabile)
- **Punteggio Atteso**: Goal attesi per squadra
- **Analisi Fattori**:
  - Vantaggio Testa a Testa
  - Vantaggio Forma Stagionale
  - Vantaggio xG
- **Dettagli Fattori**:
  - Statistiche H2H complete
  - Statistiche stagionali per squadra
  - Dati xG con differenziali

#### 3. **Homepage Update** (`frontend/src/app/page.tsx`)

Modifiche:

1. **Tipo TodayMatch esteso** con:
   - `homeTeamId`, `awayTeamId`
   - `seasonId`, `leagueId`

2. **Transform fixtures** per estrarre tutti i dati necessari

3. **Funzione analyzeMatch** aggiornata:
   - Se tutti i dati sono disponibili → `/prediction`
   - Altrimenti fallback → `/analysis`

4. **Pulsante "Analizza"** ora reindirizza a `/prediction`

---

## 🎯 Flusso di Utilizzo

1. **Utente clicca su una partita** dalla homepage
2. Sistema verifica presenza di `fixtureId`, `homeTeamId`, `awayTeamId`, `seasonId`, `leagueId`
3. Se presenti → redirect a `/prediction`
4. Frontend chiama `POST /api/ml-prediction`
5. Backend:
   - Controlla cache Redis (30 min TTL)
   - Se non in cache:
     - Recupera dati H2H
     - Recupera statistiche stagionali
     - Recupera dati xG
     - Esegue algoritmo ML
     - Salva in cache
6. Frontend mostra risultato con UI dettagliata

---

## 📊 Esempio di Output

```json
{
  "fixtureId": 19424971,
  "homeTeam": "Juventus",
  "awayTeam": "Torino",
  "predictions": {
    "homeWin": 0.52,
    "draw": 0.28,
    "awayWin": 0.20
  },
  "expectedScore": {
    "home": 1.8,
    "away": 1.1
  },
  "confidence": 85,
  "analysis": {
    "headToHeadAdvantage": "home",
    "formAdvantage": "home",
    "xGAdvantage": "home",
    "strengthDifference": 15.3
  },
  "factors": {
    "headToHead": {
      "matches": 12,
      "homeWins": 6,
      "draws": 4,
      "awayWins": 2,
      "avgHomeGoals": 1.8,
      "avgAwayGoals": 1.1,
      "weight": 0.24
    },
    "seasonStats": {
      "homeStats": { "avgGoalsScored": 1.9, "winRate": 0.55, ... },
      "awayStats": { "avgGoalsScored": 1.3, "winRate": 0.38, ... },
      "weight": 0.40
    },
    "xGData": {
      "homeAvgXG": 1.75,
      "homeAvgXGA": 0.95,
      "awayAvgXG": 1.25,
      "awayAvgXGA": 1.45,
      "weight": 0.36
    }
  }
}
```

---

## 🚀 Vantaggi del Nuovo Sistema

1. **Più Accurato**: Utilizza 3 fonti di dati invece di 1
2. **Trasparente**: Mostra quale fattore influenza la predizione
3. **Adattivo**: Pesi dinamici in base alla disponibilità dei dati
4. **Veloce**: Cache Redis per evitare ricalcoli
5. **User-Friendly**: UI moderna e intuitiva
6. **Retrocompatibile**: Fallback a `/analysis` se mancano dati

---

## 🔧 Configurazione

### Variabili d'Ambiente

Nessuna configurazione aggiuntiva necessaria. Usa le stesse chiavi API di Sportmonks:

```bash
SPORTSMONKS_API_KEY=your_api_key
SPORTSMONKS_BASE_URL=https://api.sportmonks.com/v3/football
```

### Cache Redis

- **TTL**: 30 minuti
- **Key Pattern**: `ml-prediction:{fixtureId}`

---

## 📝 Note Tecniche

- **TypeScript**: Tutti i servizi sono tipizzati
- **Error Handling**: Gestione errori robusta con fallback
- **Performance**: Chiamate API parallele con `Promise.all()`
- **SEO**: Next.js App Router con SSR support
- **Responsività**: UI ottimizzata per mobile e desktop

---

## 🎨 UI Components

### Colori

- **Casa (Home)**: Blu (`text-blue-400`, `bg-blue-900/50`)
- **Trasferta (Away)**: Rosso (`text-red-400`, `bg-red-900/50`)
- **Pareggio (Draw)**: Grigio (`text-gray-300`)
- **Confidence**: Viola (`text-purple-400`)
- **H2H**: Viola (`text-purple-400`)
- **Season Stats**: Verde (`text-green-400`)
- **xG**: Arancione (`text-orange-400`)

### Icone

- 🤖 ML Prediction
- 🏠 Casa
- ✈️ Trasferta
- ⚖️ Equilibrato
- 📜 Testa a Testa
- 📈 Statistiche
- ⚡ xG
- ⭐ Più Probabile

---

## 🔄 Future Improvements

1. **Sentiment Analysis**: Integrare notizie e sentiment social
2. **Weather Data**: Considerare condizioni meteo
3. **Player Form**: Analisi forma singoli giocatori
4. **Betting Odds Integration**: Confronto con quote bookmaker
5. **Historical Accuracy**: Tracking accuratezza predizioni nel tempo
6. **Export to CSV**: Esportazione dati per analisi offline

---

## 📚 Riferimenti

- **Sportmonks API Docs**: https://docs.sportmonks.com
- **Head-to-Head Endpoint**: `/fixtures/head-to-head/{homeId}/{awayId}`
- **Season Stats Endpoint**: `/teams/seasons/{seasonId}`
- **Fixture xG Endpoint**: `/fixtures/{fixtureId}`

---

**Versione**: 1.0.0  
**Data**: 8 Novembre 2025  
**Autore**: Sistema AI Calcio-Pred
