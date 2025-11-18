# Backtest Cache-Aware Optimization

## Feature: Smart Chunking Based on Redis Cache

Il sistema ora rileva automaticamente se i dati sono in cache Redis e adatta la strategia di caricamento:

### Logica Implementata

```javascript
// 1. Test veloce sulla prima fixture per verificare cache
const testStart = Date.now();
const testResponse = await fetch('/api/betting-recommendations', {...});
const testDuration = Date.now() - testStart;

// 2. Decisione basata su timing
const isCacheWarmed = testDuration < 100; // ms

if (isCacheWarmed) {
  // 🚀 FAST PATH: Cache warm
  // Processa TUTTE le fixture in parallelo
  const allPromises = fixtures.map(f => fetchRecommendations(f));
  const results = await Promise.all(allPromises);
  
} else {
  // 🐌 SAFE PATH: Cache cold
  // Usa chunking (3 blocchi) con pause per rate limit
  for (let chunk of chunks) {
    await Promise.all(chunk.map(f => fetchRecommendations(f)));
    await sleep(1000); // Pausa tra chunks
  }
}
```

### Performance Comparison

#### Primo Run (Cache Cold)
```
📅 Elaborazione 2025-11-09...
  ✓ 43 partite trovate
  ✓ 43 partite finite
  🔍 Checking Redis cache availability...
  🐌 Cache COLD detected (523ms) - using chunked processing
  📦 Processando chunk 1/3 (15 partite)...
  ⏳ Pausa 1 secondo...
  📦 Processando chunk 2/3 (15 partite)...
  ⏳ Pausa 1 secondo...
  📦 Processando chunk 3/3 (13 partite)...
  ✓ 15 eventi con raccomandazioni valide
  
Tempo: ~18-20 secondi
```

#### Secondo Run (Cache Warm)
```
📅 Elaborazione 2025-11-09...
  ✓ 43 partite trovate
  ✓ 43 partite finite
  🔍 Checking Redis cache availability...
  ⚡ Cache WARM detected (42ms) - processing all 43 fixtures in parallel!
  ✓ 15 eventi con raccomandazioni valide
  
Tempo: ~0.5-1 secondo
Speedup: 20-30x più veloce
```

### Threshold Decision

**Cache Hit Threshold: 100ms**

| Response Time | Cache Status | Strategy | Reason |
|--------------|--------------|----------|--------|
| < 100ms | ✅ WARM | Parallel (all at once) | Redis cache hit è <50ms, margine di sicurezza |
| ≥ 100ms | ❌ COLD | Chunked (3 blocks) | API call è >500ms, serve rate limit protection |

### Code Flow

```
┌─────────────────────────┐
│ Start Day Processing    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Fetch fixtures for date │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Test first fixture      │
│ Measure response time   │
└────────────┬────────────┘
             │
             ▼
        < 100ms ?
       /         \
     YES         NO
      │           │
      ▼           ▼
┌─────────┐  ┌─────────┐
│ FAST    │  │ SAFE    │
│ PATH    │  │ PATH    │
└────┬────┘  └────┬────┘
     │            │
     │            ▼
     │      ┌─────────────┐
     │      │ Chunk 1/3   │
     │      │ (15 matches)│
     │      └──────┬──────┘
     │             │
     │             ▼
     │      ┌─────────────┐
     │      │ Sleep 1s    │
     │      └──────┬──────┘
     │             │
     │             ▼
     │      ┌─────────────┐
     │      │ Chunk 2/3   │
     │      └──────┬──────┘
     │             │
     │             ▼
     │      ┌─────────────┐
     │      │ Sleep 1s    │
     │      └──────┬──────┘
     │             │
     │             ▼
     │      ┌─────────────┐
     │      │ Chunk 3/3   │
     │      └──────┬──────┘
     │             │
     ▼             ▼
┌─────────────────────────┐
│ Process all results     │
│ Generate multiple       │
└─────────────────────────┘
```

### Benefits

1. **Primo Run Sicuro**: Chunking evita rate limit 429 da Sportsmonks
2. **Run Successivi Veloci**: Sfrutta cache Redis al massimo (20-30x speedup)
3. **Automatico**: Nessuna configurazione manuale, si adatta da solo
4. **Intelligente**: Test di 1 fixture è poco invasivo (non impatta performance)

### Example Output

```bash
# Primo backtest (cache vuota)
$ node backtest-multiple.js
...
📅 Elaborazione 2025-11-09...
  🐌 Cache COLD detected (567ms) - using chunked processing
  📦 Chunk 1/3... ⏳ Pausa 1s... 📦 Chunk 2/3... ⏳ Pausa 1s... 📦 Chunk 3/3...
  Tempo: 18.2s

# Secondo backtest (cache calda)
$ node backtest-multiple.js
...
📅 Elaborazione 2025-11-09...
  ⚡ Cache WARM detected (38ms) - processing all 43 fixtures in parallel!
  Tempo: 0.8s ← 22x più veloce!
```

### Configuration

Nessuna configurazione necessaria! Il threshold di 100ms è ottimale per:
- Redis locale: ~10-30ms
- Redis Docker: ~20-50ms
- API cold call: ~500-2000ms

Se vuoi modificare il threshold:

```javascript
// In backtest-multiple.js
const CACHE_WARM_THRESHOLD_MS = 100; // Cambia qui se necessario
const isCacheWarmed = testDuration < CACHE_WARM_THRESHOLD_MS;
```

### Troubleshooting

**Problema**: Sempre cache COLD anche al secondo run
- **Causa**: Redis non in esecuzione o cache TTL scaduto
- **Fix**: `docker-compose up -d redis` e verifica con `redis-cli KEYS "betting_recs:*"`

**Problema**: Rate limit 429 anche con chunking
- **Causa**: Troppi backtest contemporanei
- **Fix**: Aumenta pause tra chunks da 1s a 2-3s

**Problema**: Cache warm ma comunque lento
- **Causa**: Network latency verso API backend
- **Fix**: Verifica `API_URL=http://localhost:3001` (non remote)
