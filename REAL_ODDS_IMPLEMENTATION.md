# 🎲 Implementazione Quote Reali dai Bookmaker

## 🎯 Problema Risolto

Le quote generate dal modello statistico erano molto diverse dalle quote reali dei bookmaker. Ora il sistema recupera **quote reali** direttamente da API-Football.

## ✅ Soluzione Implementata

### 1. Nuovo Servizio: `api/src/services/api-football/odds.ts`

Recupera le quote reali tramite API-Football (che hai già configurato!).

**Endpoints usati:**
- `/odds?fixture={fixtureId}` - Quote per fixture specifica
- `/fixtures?date={date}&team={teamName}` - Ricerca fixture per team

**Mercati supportati:**
- **Match Winner (1X2)**: Quote per vittoria casa, pareggio, vittoria trasferta
- **Goals Over/Under**: 1.5, 2.5, 3.5 goal
- **Both Teams Score (BTTS)**: Sì/No

**Caratteristiche:**
- ✅ Media automatica di tutti i bookmaker disponibili
- ✅ Calcolo probabilità implicite normalize (rimuove overround)
- ✅ Cache Redis (30 minuti)
- ✅ Fallback graceful se quote non disponibili

### 2. Integrazione nel Prediction Engine

**File modificato:** `api/src/services/prediction/engine.ts`

**Flusso:**

1. **Prova con Fixture ID** (per partite programmate):
   ```typescript
   realOdds = await apiFootballOdds.fetchOddsByFixtureId(input.fixtureId);
   ```

2. **Fallback con Team Names** (per predizioni manuali):
   ```typescript
   realOdds = await apiFootballOdds.fetchOddsByTeams(
     input.homeTeamName,
     input.awayTeamName,
     input.leagueId
   );
   ```

3. **Se trovate, calibra predizioni**:
   - Blend tra probabilità modello e probabilità mercato
   - Aumento confidence se modello e mercato concordano
   - Detection value bets (modello prevede probabilità > mercato)

4. **Restituisce quote reali al frontend**:
   ```json
   {
     "realOdds": {
       "odds1X2": {
         "home": 2.10,
         "draw": 3.40,
         "away": 3.60,
         "prob1": 0.442,
         "probX": 0.286,
         "prob2": 0.272
       },
       "oddsOverUnder": {
         "over25": 1.85,
         "under25": 1.95
       },
       "oddsBTTS": {
         "yes": 1.72,
         "no": 2.10
       },
       "bookmakerCount": 15,
       "overround": 1.048,
       "lastUpdate": "2025-11-07T10:30:00Z"
     }
   }
   ```

## 📊 Struttura Dati Quote

### ProcessedOdds (Interna)
```typescript
interface ProcessedOdds {
  fixtureId: number;
  odds1X2: {
    home: number;      // Es. 2.10
    draw: number;      // Es. 3.40
    away: number;      // Es. 3.60
    prob1: number;     // Probabilità implicita normalizzata (0-1)
    probX: number;
    prob2: number;
  };
  oddsOverUnder?: {
    over15: number;
    under15: number;
    over25: number;
    under25: number;
    over35: number;
    under35: number;
  };
  oddsBTTS?: {
    yes: number;
    no: number;
  };
  bookmakerCount: number;        // Numero bookmaker con quote 1X2
  avgBookmakerCount: number;     // Media bookmaker per tutti i mercati
  overround: number;             // Margine bookmaker (es. 1.05 = 5%)
  lastUpdate: string;            // ISO timestamp ultimo aggiornamento
}
```

### Risposta API (Frontend)
Le quote reali vengono aggiunte nella risposta `PredictionResponse`:
```typescript
{
  // ...tutti i dati esistenti...
  realOdds?: {  // ← NUOVO campo
    odds1X2: { home, draw, away, prob1, probX, prob2 },
    oddsOverUnder?: { ... },
    oddsBTTS?: { ... },
    bookmakerCount: number,
    overround: number,
    lastUpdate: string
  }
}
```

## 🎨 Come Mostrare nel Frontend

### Esempio: Comparazione Modello vs Bookmaker

```tsx
{data.realOdds && (
  <div className="mt-6 bg-gray-800/50 rounded-lg border border-gray-700 p-6">
    <h3 className="text-xl font-bold mb-4 text-white">
      🎲 Quote Bookmaker
    </h3>
    
    {/* Tabella comparazione */}
    <div className="grid grid-cols-4 gap-4">
      <div className="text-gray-400 font-semibold">Esito</div>
      <div className="text-gray-400 font-semibold">Quote</div>
      <div className="text-gray-400 font-semibold">Modello</div>
      <div className="text-gray-400 font-semibold">Value</div>
      
      {/* Casa */}
      <div className="text-white">1 (Casa)</div>
      <div className="text-blue-400 font-bold">
        {data.realOdds.odds1X2.home.toFixed(2)}
      </div>
      <div className="text-gray-300">
        {(data.market1X2.final.prob1 * 100).toFixed(1)}%
      </div>
      <div className={getValueColor(data.market1X2.final.prob1, data.realOdds.odds1X2.prob1)}>
        {calculateValue(data.market1X2.final.prob1, data.realOdds.odds1X2.home)}
      </div>
      
      {/* Pareggio */}
      <div className="text-white">X (Pareggio)</div>
      <div className="text-gray-400 font-bold">
        {data.realOdds.odds1X2.draw.toFixed(2)}
      </div>
      <div className="text-gray-300">
        {(data.market1X2.final.probX * 100).toFixed(1)}%
      </div>
      <div className={getValueColor(data.market1X2.final.probX, data.realOdds.odds1X2.probX)}>
        {calculateValue(data.market1X2.final.probX, data.realOdds.odds1X2.draw)}
      </div>
      
      {/* Trasferta */}
      <div className="text-white">2 (Trasferta)</div>
      <div className="text-red-400 font-bold">
        {data.realOdds.odds1X2.away.toFixed(2)}
      </div>
      <div className="text-gray-300">
        {(data.market1X2.final.prob2 * 100).toFixed(1)}%
      </div>
      <div className={getValueColor(data.market1X2.final.prob2, data.realOdds.odds1X2.prob2)}>
        {calculateValue(data.market1X2.final.prob2, data.realOdds.odds1X2.away)}
      </div>
    </div>
    
    {/* Info bookmaker */}
    <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
      <span>📊 {data.realOdds.bookmakerCount} bookmaker</span>
      <span>📈 Margine: {((data.realOdds.overround - 1) * 100).toFixed(2)}%</span>
      <span>🕐 {new Date(data.realOdds.lastUpdate).toLocaleString()}</span>
    </div>
  </div>
)}
```

### Helper Functions

```typescript
// Calcola value bet
function calculateValue(modelProb: number, odds: number): string {
  const ev = (modelProb * odds) - 1;
  return ev > 0 ? `+${(ev * 100).toFixed(1)}%` : `${(ev * 100).toFixed(1)}%`;
}

// Colore per value
function getValueColor(modelProb: number, marketProb: number): string {
  const diff = modelProb - marketProb;
  if (diff > 0.10) return 'text-green-400 font-bold'; // Value bet!
  if (diff > 0.05) return 'text-yellow-400';
  return 'text-gray-400';
}
```

## 🚀 Test

### 1. Test con Fixture Esistente

```bash
# Nel backend, aggiungi log
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "fixtureId": 1234567,
    "homeTeamId": 33,
    "awayTeamId": 34,
    "season": 2024,
    "leagueId": 39
  }'
```

Cerca nei log:
```
🎲 Fetching real odds from API-Football
✅ Real odds fetched from API-Football { bookmakers: 15, home: '2.10', draw: '3.40', away: '3.60' }
```

### 2. Test con Predizione Manuale

```bash
curl -X POST http://localhost:3001/api/predictions/calculate-by-name \
  -H "Content-Type: application/json" \
  -d '{
    "homeTeamName": "Liverpool",
    "awayTeamName": "Manchester City"
  }'
```

Cerca nei log:
```
🔍 Searching odds by team names
✅ Real odds fetched from API-Football
```

### 3. Verifica Cache

```bash
# Redis CLI
docker exec -it calcio-pred-redis-1 redis-cli

# Lista quote in cache
KEYS odds:*

# Vedi una quota specifica
GET "odds:fixture:1234567"

# Controlla TTL (30 minuti = 1800 secondi)
TTL "odds:fixture:1234567"
```

## 📈 Benefici

### 1. Quote Reali vs Modello

**Prima:**
- Quote calcolate solo statisticamente
- Spesso molto diverse dalla realtà
- Nessun riferimento al mercato

**Dopo:**
- Quote reali da 10-20 bookmaker
- Media pesata accurata
- Calibrazione automatica del modello

### 2. Value Betting

Il sistema ora può identificare **value bets**:

```
Esempio:
- Modello prevede: Liverpool vittoria 55%
- Bookmaker offrono: Liverpool @ 2.10 (47.6% implicito)
- Differenza: +7.4% → VALUE BET!
- Expected Value: +15.5%
```

### 3. Confidence Boost

Se modello e mercato concordano:
- Differenza < 5% → Confidence +10%
- Differenza < 3% → Confidence +15%

## ⚙️ Configurazione

### Cache TTL

Modifica in `api/src/services/api-football/odds.ts`:

```typescript
// Cache per 30 minuti (default)
await cacheSet(cacheKey, processed, 1800);

// Altre opzioni:
// 15 minuti: 900
// 1 ora: 3600
// 2 ore: 7200
```

### Blend Weight

Modifica in `api/src/config/index.ts`:

```typescript
oddsBlendWeight: 0.30  // 70% modello + 30% mercato (default)

// Più peso al mercato:
oddsBlendWeight: 0.50  // 50/50

// Più peso al modello:
oddsBlendWeight: 0.20  // 80% modello + 20% mercato
```

## 🐛 Troubleshooting

### "No odds data available for fixture"

**Cause possibili:**
1. Fixture troppo vecchia (bookmaker non offrono più quote)
2. Fixture troppo lontana nel futuro (quote non ancora pubblicate)
3. Lega minore non coperta dai bookmaker

**Soluzione:** Il sistema continua con le predizioni del modello.

### "Error fetching odds: 429"

**Causa:** Rate limit API-Football raggiunto.

**Soluzione:** 
- Le quote sono già in cache per 30 minuti
- Riduci frequenza richieste
- Verifica piano API-Football

### Cache non funziona

**Verifica Redis:**
```bash
docker ps | grep redis  # Verifica che Redis sia running
docker logs calcio-pred-redis-1  # Controlla log Redis
```

## 🎯 Prossimi Miglioramenti

- [ ] **Storico quote**: Salvare quote nel tempo per analisi trend
- [ ] **Multipli bookmaker**: Mostrare migliori quote per bookmaker specifico
- [ ] **Arbitrage detection**: Identificare opportunità di arbitraggio
- [ ] **Quote live**: Aggiornamento real-time durante le partite
- [ ] **Surebet calculator**: Calcolo automatico surebet

---

**Implementato il**: 7 novembre 2025  
**Status**: ✅ Funzionante e testato
**API Required**: API-Football (già configurata ✅)
