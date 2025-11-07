# 📊 Guida Integrazione xG Storici

## 🎯 Cosa È Stato Modificato

Abbiamo integrato **Expected Goals (xG) storici** da API-FOOTBALL nel sistema di predizione. Ora il calcolo di lambda (gol attesi) per il modello Poisson utilizza sia i **gol reali** che gli **xG storici** delle partite precedenti.

---

## 🔧 Modifiche Implementate

### 1. **Schema Prisma - MatchHistory** ✅
Aggiunti campi per xG storici:

```prisma
model MatchHistory {
  // ... campi esistenti ...
  
  // Expected Goals (xG) - dati storici reali da API-FOOTBALL
  homeXg          Float?    // xG casa
  awayXg          Float?    // xG trasferta
  homeXgot        Float?    // xG on Target casa (facoltativo)
  awayXgot        Float?    // xG on Target trasferta (facoltativo)
  xgFetchedAt     DateTime? // Timestamp ultimo fetch xG
}
```

### 2. **History Service** ✅
Nuovi metodi per recuperare xG storici:

```typescript
// Nuovo metodo che recupera storico + xG
async getTeamHistoryWithXG(
  teamId: number,
  season: number,
  limit: number = 20,
  fetchXG: boolean = true
): Promise<MatchHistoryData[]>

// Aggiornato per supportare xG
async getTeamHistoryByVenue(
  teamId: number,
  season: number,
  isHome: boolean,
  limit: number = 20,
  fetchXG: boolean = true // NUOVO parametro
): Promise<MatchHistoryData[]>
```

**Funzionalità:**
- Recupera automaticamente xG da API-FOOTBALL per ogni partita storica
- Cache integrata (già presente in statisticsService)
- Logging della copertura xG (% di match con xG disponibile)

### 3. **Empiric Analyzer** ✅
Calcola medie xG/xGA storiche:

```typescript
interface analyzeResults {
  // ... campi esistenti ...
  
  // NUOVI campi
  avgXG: number | null;      // Media xG squadra
  avgXGA: number | null;     // Media xGA squadra (gol attesi subiti)
  xgCoverage: number;        // % match con xG (0-1)
}
```

**Output in EmpiricResult:**
```typescript
{
  // ... risultati esistenti ...
  homeAvgXG: 1.45,      // Media xG casa
  awayAvgXG: 1.20,      // Media xG trasferta
  homeAvgXGA: 1.10,     // Media xGA casa
  awayAvgXGA: 1.35,     // Media xGA trasferta
  xgCoverage: 0.85      // 85% di match con xG disponibile
}
```

### 4. **Poisson Engine** ✅
Lambda calculation con blend xG storici:

**Formula blending:**
```
lambdaFinal = (70% * lambdaFromGoals) + (30% * lambdaFromXG)
```

**Logica:**
- Se copertura xG > 30% → Applica blending
- Se copertura xG < 30% → Usa solo gol reali
- Clamp lambda tra 0.3 e 4.0 (valori realistici)

**Esempio di calcolo:**
```typescript
// Match storici casa:
// Match 1: 2 gol, xG = 1.8
// Match 2: 1 gol, xG = 1.5
// Match 3: 3 gol, xG = 2.2
// Media gol reali: 2.0
// Media xG: 1.83

// Lambda finale (con blend 30%):
lambdaHome = 0.70 * 2.0 + 0.30 * 1.83 = 1.95
```

### 5. **Prediction Engine** ✅
Aggiornato `fetchHistoricalData` per recuperare xG:

```typescript
const [homeHistory, awayHistory] = await Promise.all([
  historyService.getTeamHistoryByVenue(
    input.homeTeamId,
    input.season,
    true,  // home
    calculationConfig.historyGames,
    true   // fetchXG = TRUE ✅
  ),
  historyService.getTeamHistoryByVenue(
    input.awayTeamId,
    input.season,
    false, // away
    calculationConfig.historyGames,
    true   // fetchXG = TRUE ✅
  ),
]);
```

---

## 📊 Flusso di Calcolo Completo

```
1. FETCH STORICO
   ├─ getTeamHistoryWithXG(homeTeam)
   │  ├─ Recupera ultime 20 partite casa
   │  └─ Per ogni partita: fetch xG da API-FOOTBALL
   │
   └─ getTeamHistoryWithXG(awayTeam)
      ├─ Recupera ultime 20 partite trasferta
      └─ Per ogni partita: fetch xG da API-FOOTBALL

2. EMPIRIC ANALYZER
   ├─ Analizza gol reali (media, distribuzione)
   ├─ Calcola avgXG, avgXGA (se disponibili)
   └─ Output: homeAvgXG, homeAvgXGA, xgCoverage

3. POISSON ENGINE
   ├─ Calcola lambdaFromGoals (da gol reali con time-decay)
   ├─ Calcola lambdaFromXG (da xG storici con time-decay)
   ├─ BLEND: 70% goals + 30% xG (se coverage > 30%)
   ├─ Applica Dixon-Coles correction
   └─ Output: lambdaHome, lambdaAway

4. CALIBRAZIONE FINALE (già esistente)
   ├─ Blend lambda con xG della partita corrente
   └─ Formula: (70% storico + 30% xG match corrente)
```

---

## 🧪 Come Testare

### 1. Crea Migration Database

```powershell
cd c:\Users\Utente\Desktop\sito\calcio-pred\api

# Crea migration
npx prisma migrate dev --name add_xg_to_match_history

# Genera Prisma Client
npx prisma generate
```

### 2. Test Manuale - Fetch xG Storici

Crea un file di test `test-xg-historical.js`:

```javascript
const { historyService } = require('./api/src/services/api-football');

async function testXGHistorical() {
  try {
    // Test con Juventus (teamId = 487)
    const history = await historyService.getTeamHistoryWithXG(
      487,    // Juventus
      2024,   // Season
      10,     // Ultime 10 partite
      true    // Fetch xG
    );

    console.log(`\n📊 Storico Juventus (${history.length} partite):\n`);

    let xgCount = 0;
    let totalXG = 0;
    let totalGoals = 0;

    history.forEach((match, idx) => {
      const teamGoals = match.isHome ? match.homeGoals : match.awayGoals;
      const teamXG = match.isHome ? match.homeXg : match.awayXg;
      
      console.log(`${idx + 1}. ${match.homeTeamName} vs ${match.awayTeamName}`);
      console.log(`   Data: ${match.date.toISOString().split('T')[0]}`);
      console.log(`   Gol: ${match.homeGoals}-${match.awayGoals}`);
      
      if (teamXG !== null && teamXG !== undefined) {
        console.log(`   xG: ${match.homeXg?.toFixed(2)} - ${match.awayXg?.toFixed(2)}`);
        console.log(`   Team xG: ${teamXG.toFixed(2)} (gol reali: ${teamGoals})`);
        xgCount++;
        totalXG += teamXG;
      } else {
        console.log(`   xG: Non disponibile`);
      }
      console.log('');

      totalGoals += teamGoals;
    });

    const xgCoverage = (xgCount / history.length) * 100;
    const avgXG = xgCount > 0 ? totalXG / xgCount : 0;
    const avgGoals = history.length > 0 ? totalGoals / history.length : 0;

    console.log(`\n📈 STATISTICHE:`);
    console.log(`   Copertura xG: ${xgCoverage.toFixed(1)}%`);
    console.log(`   Media xG: ${avgXG.toFixed(2)}`);
    console.log(`   Media gol reali: ${avgGoals.toFixed(2)}`);
    console.log(`   Differenza: ${(avgGoals - avgXG).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
}

testXGHistorical();
```

**Esegui:**
```powershell
cd c:\Users\Utente\Desktop\sito\calcio-pred
node test-xg-historical.js
```

### 3. Test Completo - Calcolo Predizione

```javascript
const { predictionEngine } = require('./api/src/services/prediction');

async function testPredictionWithXG() {
  try {
    const prediction = await predictionEngine.calculatePrediction({
      fixtureId: 1234567,  // ID partita da testare
      homeTeamId: 487,     // Juventus
      awayTeamId: 489,     // AC Milan
      season: 2024,
      leagueId: 135        // Serie A
    });

    console.log('\n🎯 PREDIZIONE CALCOLATA:\n');
    
    // Empiric con xG storici
    console.log('📊 EMPIRIC ANALYZER:');
    console.log(`   Home avg xG: ${prediction.empiric?.homeAvgXG?.toFixed(2) || 'N/A'}`);
    console.log(`   Away avg xG: ${prediction.empiric?.awayAvgXG?.toFixed(2) || 'N/A'}`);
    console.log(`   xG Coverage: ${(prediction.empiric?.xgCoverage * 100).toFixed(1)}%`);
    
    // Poisson con lambda blended
    console.log('\n⚡ POISSON ENGINE:');
    console.log(`   Lambda Home: ${prediction.poissonParams.lambdaHome.toFixed(2)}`);
    console.log(`   Lambda Away: ${prediction.poissonParams.lambdaAway.toFixed(2)}`);
    
    // Risultato finale
    console.log('\n🎲 PROBABILITÀ FINALI:');
    console.log(`   1 (Home Win): ${(prediction.market1X2.final.prob1 * 100).toFixed(1)}%`);
    console.log(`   X (Draw):     ${(prediction.market1X2.final.probX * 100).toFixed(1)}%`);
    console.log(`   2 (Away Win): ${(prediction.market1X2.final.prob2 * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
}

testPredictionWithXG();
```

---

## 📈 Impatto sul Sistema

### Vantaggi ✅

1. **Predizioni più accurate**: Lambda basato su xG storici + gol reali
2. **Migliore calibrazione**: Due livelli di xG (storico + match corrente)
3. **Trasparenza**: Logging della copertura xG e differenze goal vs xG
4. **Resilienza**: Fallback automatico a gol reali se xG non disponibili

### Consumo API 📊

**Con 7500 chiamate/giorno:**

- **Fixture oggi**: ~50 chiamate (caricamento partite)
- **xG per fixture corrente**: 50 chiamate (1 per match)
- **xG storici (20 match × 2 squadre)**: 40 chiamate per fixture
- **Totale per 50 fixture**: ~50 + 50 + (50 × 40) = **2100 chiamate**

**Budget rimanente**: 5400 chiamate (per refresh lineup, injuries, etc.)

### Ottimizzazioni 🚀

1. **Cache Redis**: xG storici cached per 7200s (2 ore)
2. **Batch fetching**: Parallelizzato con Promise.all
3. **Soglia copertura**: Blend xG solo se coverage > 30%
4. **Fallback graceful**: Usa solo gol reali se xG non disponibili

---

## 🔍 Debugging e Monitoring

### Log da Cercare

```typescript
// 1. Copertura xG storico
"Historical xG data fetched" {
  total: 20,
  withXG: 17,
  coverage: "85.0%"
}

// 2. Blend lambda con xG
"Lambda calculated with historical xG blend" {
  isHome: true,
  lambdaGoals: "1.85",
  lambdaXG: "1.72",
  lambdaBlended: "1.81",
  xgCoverage: "85.0%",
  blendWeight: 0.30
}

// 3. xG empiric disponibile
"Historical xG data available" {
  homeAvgXG: "1.45",
  awayAvgXG: "1.20",
  homeAvgXGA: "1.10",
  awayAvgXGA: "1.35",
  xgCoverage: "85.0%"
}
```

### Check Health

```powershell
# Verifica match con xG disponibili
SELECT 
  COUNT(*) as total,
  COUNT(homeXg) as with_xg,
  (COUNT(homeXg)::float / COUNT(*) * 100) as coverage_pct
FROM match_history
WHERE season = 2024;

# Trova match con alta divergenza goal vs xG
SELECT 
  homeGoals, 
  awayGoals,
  homeXg,
  awayXg,
  ABS(homeGoals - homeXg) as home_diff,
  ABS(awayGoals - awayXg) as away_diff
FROM match_history
WHERE homeXg IS NOT NULL
  AND (ABS(homeGoals - homeXg) > 1.5 OR ABS(awayGoals - awayXg) > 1.5)
ORDER BY home_diff + away_diff DESC
LIMIT 10;
```

---

## 🎛️ Configurazione

Parametri modificabili in `.env`:

```env
# xG Blend Weight (0-1)
# 0.30 = 30% xG storico, 70% gol reali
XG_BLEND_WEIGHT=0.30

# Soglia minima copertura xG per blend
# 0.30 = richiede almeno 30% dei match con xG
XG_COVERAGE_THRESHOLD=0.30

# Match storici da analizzare
HISTORY_GAMES=20
```

**Raccomandazioni:**
- `XG_BLEND_WEIGHT`: 0.25-0.35 (ottimale 0.30)
- `XG_COVERAGE_THRESHOLD`: 0.30 (almeno 6/20 match con xG)
- `HISTORY_GAMES`: 20 (compromesso tra accuratezza e API calls)

---

## 🚀 Prossimi Passi

1. ✅ Migration database completata
2. ✅ Test fetch xG storici
3. ⏳ Test calcolo predizione completo
4. ⏳ Monitoring copertura xG per 1 settimana
5. ⏳ Analisi accuracy con/senza xG storici
6. ⏳ Fine-tuning XG_BLEND_WEIGHT in base ai risultati

---

## 📞 Supporto

Per problemi o domande:
- Verifica logs: `docker-compose logs -f api | grep -i "xg\|lambda"`
- Check database: Query coverage xG
- Test isolato: Usa `test-xg-historical.js`

**Status:** ✅ Implementazione completa, pronta per testing
