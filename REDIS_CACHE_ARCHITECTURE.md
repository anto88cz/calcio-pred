# Redis Cache Architecture

## Overview

Il sistema utilizza Redis come cache distribuita per ridurre drasticamente le chiamate API a Sportsmonks e velocizzare i backtest.

## Architettura

```
┌─────────────────────┐
│  backtest-multiple  │
│  uptest-multiple    │
│  frontend           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  betting-recommendations.routes.ts  │  ← Cache L1 (TTL: 1h)
│  Key: betting_recs:{fixtureId}:...  │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  ml-algorithm.service.ts            │  (No cache - solo calcoli)
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Sportsmonks Services               │  ← Cache L2 (TTL variabile)
│  - statistics.ts                    │
│  - teams.ts                         │
│  - odds.ts                          │
│  - leagues.ts                       │
│  - lineups.ts                       │
│  - injuries.ts                      │
└─────────────────────────────────────┘
```

## Cache Keys e TTL

### Layer 1: Betting Recommendations (Route Level)
- **Key**: `betting_recs:{fixtureId}:{homeTeamId}:{awayTeamId}`
- **TTL**: 3600s (1 ora)
- **Contenuto**: Intero payload di raccomandazioni con ML predictions, odds, value ratings
- **File**: `api/src/routes/betting-recommendations.routes.ts`

### Layer 2: Sportsmonks Raw Data

#### Statistics Service
- **Keys**: 
  - `sportsmonks:team_stats:{teamId}:{seasonId}`
  - `sportsmonks:match_history:{teamId}:{seasonId}`
  - `sportsmonks:fixtures:{date}`
- **TTL**: 3600s (1 ora) per statistiche, 86400s (24 ore) per fixtures
- **File**: `api/src/services/sportsmonks/statistics.ts`

#### Teams Service
- **Keys**:
  - `sportsmonks:team:{teamId}`
  - `sportsmonks:team_statistics:{teamId}:{seasonId}`
  - `sportsmonks:league_teams:{leagueId}:{seasonId}`
- **TTL**: 86400s (24 ore) per teams, 3600s per statistics
- **File**: `api/src/services/sportsmonks/teams.ts`

#### Odds Service
- **Keys**: `sportsmonks:odds:{fixtureId}`
- **TTL**: 1800s (30 minuti)
- **File**: `api/src/services/sportsmonks/odds.ts`

#### Leagues Service
- **Keys**:
  - `sportsmonks:leagues:{countryId}`
  - `sportsmonks:league:{leagueId}`
  - `sportsmonks:seasons:{leagueId}`
- **TTL**: 604800s (7 giorni)
- **File**: `api/src/services/sportsmonks/leagues.ts`

#### Lineups Service
- **Keys**:
  - `sportsmonks:lineup:{fixtureId}`
  - `sportsmonks:squad:{teamId}:{seasonId}`
- **TTL**: 7200s (2 ore) per lineup, 86400s per squad
- **File**: `api/src/services/sportsmonks/lineups.ts`

#### Injuries Service
- **Keys**:
  - `sportsmonks:injuries:{teamId}`
  - `sportsmonks:fixture_injuries:{fixtureId}`
- **TTL**: 21600s (6 ore)
- **File**: `api/src/services/sportsmonks/injuries.ts`

## Vantaggi per Backtest

### Primo Run (Cold Start)
```
Tempo per giornata: ~15-20s
Chiamate API: ~30-50 per giornata
```

### Run Successivi (Cache Warm)
```
Tempo per giornata: ~0.5-1s
Chiamate API: 0 (100% da cache)
Speedup: 15-30x più veloce
```

### Esempio Pratico

**Backtest Q1 2025 (90 giorni, ~2000 partite)**

| Metrica | Senza Cache | Con Cache |
|---------|-------------|-----------|
| Tempo totale | ~6-8 ore | ~15-30 minuti |
| Chiamate API | ~60,000-100,000 | ~60,000 (primo run) + 0 (successivi) |
| Costo API | Alto rischio rate limit | Nessun rate limit |
| Iterazioni | 1 sola volta | Infinite iterazioni veloci |

## Comandi Utili

### Verificare Cache Redis

```bash
# Connetti a Redis
docker exec -it calciopred-redis redis-cli

# O se locale
redis-cli

# Lista tutte le chiavi
KEYS *

# Lista chiavi betting recommendations
KEYS betting_recs:*

# Lista chiavi Sportsmonks
KEYS sportsmonks:*

# Ottieni una chiave specifica
GET betting_recs:123456:789:101112

# Verifica TTL rimanente
TTL betting_recs:123456:789:101112

# Count chiavi per pattern
EVAL "return #redis.call('keys', 'betting_recs:*')" 0
EVAL "return #redis.call('keys', 'sportsmonks:*')" 0
```

### Pulire Cache

```bash
# Pulisci solo betting recommendations (per re-test)
redis-cli --scan --pattern "betting_recs:*" | xargs redis-cli DEL

# Pulisci solo dati Sportsmonks
redis-cli --scan --pattern "sportsmonks:*" | xargs redis-cli DEL

# Pulisci TUTTO (usa con cautela)
redis-cli FLUSHDB
```

### Monitorare Cache Hit Rate

```bash
# Statistiche Redis
redis-cli INFO stats | grep keyspace

# Monitor real-time (vedi tutte le operazioni)
redis-cli MONITOR
```

## Best Practices

### Durante Sviluppo
1. **Primo backtest del giorno**: Popola cache (lento ma necessario)
2. **Iterazioni successive**: Modifica solo logica predizioni, cache intatta (velocissimo)
3. **Test parametri diversi**: No bisogno di rifare API calls

### Durante Debug
1. Se sospetti dati stale: `redis-cli DEL betting_recs:*` per quella fixture
2. Se cambi logica Sportsmonks: `redis-cli FLUSHDB` per partire pulito
3. Usa `TTL` command per vedere quando scadono i dati

### Performance Tips
- Cache L1 (betting_recs) ha TTL 1h: ottimo per backtest stesso giorno
- Cache L2 (sportsmonks) ha TTL variabile: dati storici restano più a lungo
- Per backtest lunghi (es. 6 mesi): prima esegui script per pre-popolare cache

## Configurazione

### Redis URL
```bash
# .env file
REDIS_URL=redis://localhost:6379

# Docker
REDIS_URL=redis://calciopred-redis:6379
```

### Dipendenze
```json
{
  "ioredis": "^5.3.2"
}
```

### Client Setup
- **API Backend**: `api/src/lib/redis.ts` (singleton con retry logic)
- **Scripts Root**: `lib/redis-client.js` (lightweight per backtest scripts)

## Troubleshooting

### Cache Non Funziona
1. Verifica Redis in esecuzione: `docker ps | grep redis`
2. Testa connessione: `redis-cli PING` (dovrebbe rispondere `PONG`)
3. Check logs: `docker logs calciopred-redis`

### Dati Stale
- TTL automatico rimuove dati vecchi
- Per forzare refresh: DELETE chiave specifica
- Redis gestisce memory eviction automaticamente (LRU)

### Rate Limit Sportsmonks
- Se primo backtest grande: aggiungi `await new Promise(r => setTimeout(r, 100))` tra fixture
- Cache riduce drasticamente rate limit su run successivi
- Monitor con `api/src/utils/api-monitor.ts`

## Metriche di Successo

### Target Performance
- ✅ Cache hit rate > 95% dopo primo run
- ✅ Backtest re-run 20x più veloce
- ✅ Zero chiamate API su iterazioni successive
- ✅ Nessun errore rate limit

### Current Status
- ✅ Layer 2 (Sportsmonks) implementato e testato
- ✅ Layer 1 (Betting Recs) appena aggiunto
- 🔄 Testing in corso con backtest-multiple.js
