# API-FOOTBALL Services 🚀

## ✅ Completato

Implementazione completa del client API-FOOTBALL con tutti i moduli necessari per il sistema di predizioni.

## 📦 Moduli Implementati

### 1. **Client Base** (`client.ts`)

Client HTTP con funzionalità avanzate:

#### Features
- ✅ **Rate Limiting**: Rispetta limiti API (10 req/min di default)
- ✅ **Request Delay**: Pausa tra richieste per evitare throttling
- ✅ **Caching Redis**: Cache automatico con TTL configurabile
- ✅ **Retry Logic**: Retry automatico con exponential backoff
- ✅ **Error Handling**: Gestione errori 401, 403, 429, 500, 502, 503
- ✅ **Request Queue**: Coda per gestire picchi di traffico
- ✅ **Logging**: Log dettagliati di tutte le richieste
- ✅ **Health Check**: Verifica stato API

#### Uso Base
```typescript
import { apiFootballClient } from './services/api-football';

// Request singola con cache
const fixtures = await apiFootballClient.request('/fixtures', 
  { date: '2025-10-26' },
  { cache: true, cacheTTL: 3600, retries: 3 }
);

// Batch request
const results = await apiFootballClient.batchRequest('/fixtures', [
  { id: 1 },
  { id: 2 },
  { id: 3 }
]);

// Health check
const isHealthy = await apiFootballClient.healthCheck();
```

---

### 2. **Fixtures Service** (`fixtures.ts`)

Gestione partite e calendario.

#### Metodi

```typescript
// Partite per data
const fixtures = await fixturesService.getFixturesByDate('2025-10-26');

// Partite per range
const fixtures = await fixturesService.getFixturesByDateRange('2025-10-26', '2025-10-31');

// Fixture singola
const fixture = await fixturesService.getFixtureById(12345);

// Partite per squadra
const fixtures = await fixturesService.getFixturesByTeam(
  33, // Juventus
  2024,
  { last: 20 }
);

// Partite live
const liveFixtures = await fixturesService.getLiveFixtures();

// Head to head
const h2h = await fixturesService.getHeadToHead(33, 489, { last: 10 });

// Partite per lega
const fixtures = await fixturesService.getFixturesByLeague(135, 2024);
```

#### Filtri Utility
```typescript
// Solo partite ufficiali (no amichevoli)
const official = fixturesService.filterOfficialFixtures(fixtures);

// Solo partite concluse (FT, AET, PEN)
const finished = fixturesService.filterFinishedFixtures(fixtures);

// Escludi sospese/cancellate
const valid = fixturesService.filterValidFixtures(fixtures);
```

---

### 3. **History Service** (`history.ts`)

Storico partite per calcoli statistici (Empirico + Poisson).

#### Metodi Principali

```typescript
// Ultime 20 partite squadra
const history = await historyService.getTeamHistory(33, 2024, 20);

// Storico casa/trasferta separato
const homeHistory = await historyService.getTeamHistoryByVenue(33, 2024, true, 20);
const awayHistory = await historyService.getTeamHistoryByVenue(33, 2024, false, 20);

// Head to head storico
const h2hHistory = await historyService.getHeadToHeadHistory(33, 489, 10);

// Statistiche aggregate
const stats = historyService.calculateAggregateStats(history);
// Returns: { wins, draws, losses, goalsScored, avgGoalsScored, btts, over25, ... }

// Forma recente (ultimi 5)
const form = historyService.calculateRecentForm(history, 5);
// Returns: [3, 1, 3, 0, 3] // 3=win, 1=draw, 0=loss

// Time decay (più recenti = più peso)
const weighted = historyService.applyTimeDecay(history, 0.95);

// Qualità dati
const quality = historyService.assessHistoryQuality(homeHistory, awayHistory);
// Returns: { quality: 'EXCELLENT', score: 0.92, homeMatches: 20, awayMatches: 20 }
```

#### Output MatchHistoryData
```typescript
interface MatchHistoryData {
  fixtureId: number;
  date: Date;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  isHome: boolean; // Prospettiva squadra
  leagueId: number;
  leagueName: string;
  season: number;
  statistics?: FixtureStatistics[];
}
```

---

### 4. **Statistics Service** (`statistics.ts`)

Statistiche avanzate partite.

#### Metodi

```typescript
// Statistiche fixture
const stats = await statisticsService.getFixtureStatistics(12345);

// Statistiche squadra stagione
const teamStats = await statisticsService.getTeamStatistics(33, 2024, 135);

// Media da multiple partite
const avgStats = statisticsService.calculateAverageStats(matchesStats);
// Returns: { avgShotsOnGoal, avgPossession, avgCorners, avgFouls }
```

#### Output FixtureStatistics
```typescript
interface FixtureStatistics {
  team: { id: number; name: string };
  statistics: {
    shotsOnGoal: number | null;
    totalShots: number | null;
    ballPossession: number | null;
    cornerKicks: number | null;
    fouls: number | null;
    yellowCards: number | null;
    redCards: number | null;
    totalPasses: number | null;
    passesAccurate: number | null;
    passesPercentage: number | null;
    // ... altri
  };
}
```

---

### 5. **Injuries Service** (`injuries.ts`)

Gestione infortuni, squalifiche, assenze.

#### Metodi

```typescript
// Infortuni per fixture
const injuries = await injuriesService.getInjuriesByFixture(12345);

// Infortuni per squadra
const teamInjuries = await injuriesService.getInjuriesByTeam(33, 2024);

// Infortuni per lega
const leagueInjuries = await injuriesService.getInjuriesByLeague(135, 2024);

// Filtra per tipo
const serious = injuriesService.filterByType(injuries, ['Injury', 'Suspended']);

// Calcola impatto su confidence (0-1)
const impact = injuriesService.calculateInjuryImpact(injuries);
// 1.0 = nessun impatto, 0.0 = impatto massimo

// Raggruppa per squadra
const grouped = injuriesService.groupByTeam(injuries);

// Verifica infortuni critici
const hasCritical = injuriesService.hasCriticalInjuries(injuries);
// true se portiere infortunato o >3 giocatori
```

#### Tipi Infortunio
- `Injury` - Infortunio certo
- `Suspended` - Squalifica
- `Missing` - Assenza generica
- `Doubtful` - Dubbio

---

### 6. **Lineups Service** (`lineups.ts`)

Gestione formazioni confermate.

#### Metodi

```typescript
// Formazioni per fixture
const lineups = await lineupsService.getLineupsByFixture(12345);

// Verifica conferma
const confirmed = lineupsService.areLineupsConfirmed(lineups);

// Calcola confidence boost (0.5-1.0)
const confidence = lineupsService.calculateLineupConfidence(lineups);

// Parse formazione
const system = lineupsService.getFormationSystem('4-3-3');
// Returns: { defenders: 4, midfielders: 3, attackers: 3 }

// Identifica key players
const players = lineupsService.identifyKeyPlayers(lineups[0]);
// Returns: { goalkeeper, defenders[], midfielders[], attackers[] }

// Compara con formazione usuale
const comparison = lineupsService.compareWithUsualFormation('4-3-3', '4-4-2');
// Returns: { isSame: false, similarity: 0.67 }

// Verifica tipo formazione
const isOffensive = lineupsService.isOffensiveFormation('4-3-3'); // true
const isDefensive = lineupsService.isDefensiveFormation('5-4-1'); // true
```

---

### 7. **Teams Service** (`teams.ts`)

Gestione anagrafica squadre.

#### Metodi

```typescript
// Squadra per ID
const team = await teamsService.getTeamById(33);

// Ricerca per nome
const teams = await teamsService.searchTeamsByName('Juventus');

// Squadre per paese
const italianTeams = await teamsService.getTeamsByCountry('Italy');

// Squadre per lega
const serieATeams = await teamsService.getTeamsByLeague(135, 2024);

// Batch get
const teamsMap = await teamsService.getTeamsByIds([33, 489, 497]);
```

---

## 🔧 Configurazione

Tutte le configurazioni sono in `api/.env`:

```env
# API-FOOTBALL
APIFOOTBALL_BASE=https://v3.football.api-sports.io
APIFOOTBALL_KEY=your_api_key_here

# Rate Limiting
API_RATE_LIMIT_PER_MINUTE=10
API_REQUEST_DELAY=6000

# Cache TTL
CACHE_FIXTURES_TTL=3600
CACHE_PREDICTIONS_TTL=1800

# Data Validation
EXCLUDE_FRIENDLIES=true
ONLY_OFFICIAL_RESULTS=true
MIN_MATCH_TIME=90
```

---

## 📊 Flow Tipico

### Per Calcolare Predizioni

```typescript
// 1. Get fixture
const fixture = await fixturesService.getFixtureById(fixtureId);

// 2. Get storico squadre
const homeHistory = await historyService.getTeamHistoryByVenue(
  fixture.teams.home.id, 
  fixture.league.season, 
  true, 
  20
);

const awayHistory = await historyService.getTeamHistoryByVenue(
  fixture.teams.away.id, 
  fixture.league.season, 
  false, 
  20
);

// 3. Get infortuni
const injuries = await injuriesService.getInjuriesByFixture(fixtureId);

// 4. Get formazioni (se disponibili)
const lineups = await lineupsService.getLineupsByFixture(fixtureId);

// 5. Calcola confidence factors
const historyQuality = historyService.assessHistoryQuality(homeHistory, awayHistory);
const injuryImpact = injuriesService.calculateInjuryImpact(injuries);
const lineupConfidence = lineupsService.calculateLineupConfidence(lineups);

// 6. Passa al motore di calcolo (Step 5)
// ... empirico + poisson + blend
```

---

## 🚨 Error Handling

Tutti i servizi:
- ✅ Lanciano errori su fallimento
- ✅ Loggano errori con context
- ✅ Ritornano array vuoti o null su dati mancanti (non errori)
- ✅ Retry automatico su errori temporanei

```typescript
try {
  const fixtures = await fixturesService.getFixturesByDate(date);
} catch (error) {
  // Gestisci errore API
  logger.error({ error }, 'Failed to fetch fixtures');
}
```

---

## 📝 Files Creati

```
api/src/services/api-football/
├── client.ts           ✅ Client base + rate limiting + cache + retry
├── fixtures.ts         ✅ Gestione partite + filtri
├── history.ts          ✅ Storico + statistiche aggregate + time decay
├── statistics.ts       ✅ Statistiche avanzate partite
├── injuries.ts         ✅ Infortuni + impatto confidence
├── lineups.ts          ✅ Formazioni + confidence boost
├── teams.ts            ✅ Anagrafica squadre
└── index.ts            ✅ Export centrale
```

---

## 🎯 Pronto per Step 5!

Il client API-FOOTBALL è completo e pronto per essere usato dal **motore di calcolo** (Empirico + Poisson).

Tutte le funzioni necessarie sono implementate:
- ✅ Fetch fixtures e storico
- ✅ Filtri per partite ufficiali/concluse
- ✅ Statistiche aggregate con time-decay
- ✅ Gestione infortuni e impatto
- ✅ Formazioni e confidence boost
- ✅ Rate limiting e cache
- ✅ Error handling e retry
