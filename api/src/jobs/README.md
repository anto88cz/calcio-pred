# ⏰ Cron Scheduler

Sistema di job schedulati per automazione predizioni calcio.

## 📅 Jobs

### 1. **Daily Fixtures** (06:00)
Carica fixtures giornaliere da Sportsmonks.

**Timing:** Ogni giorno alle 06:00 (timezone configurabile)  
**Cron:** `0 6 * * *`  
**Lock TTL:** 10 minuti

**Cosa fa:**
1. Fetch fixtures da Sportsmonks per le leghe configurate
2. Filtra solo partite di oggi
3. Salva fixtures nel DB (upsert)
4. Assicura che i team esistano
5. Calcola predizioni per fixtures senza predizione
6. Log job esecuzione

**Config:**
```env
CRON_ENABLED=true
CRON_DAILY_FIXTURES=0 6 * * *
CRON_TIMEZONE=Europe/Rome
CRON_LEAGUE_IDS=39,135,140,78,61  # Premier, Serie A, La Liga, Bundesliga, Ligue 1
```

---

### 2. **Lineup Refresh** (H-120)
Aggiorna lineup e ricalcola predizioni 2 ore prima del match.

**Timing:** Ogni 15 minuti (controlla fixtures H-120)  
**Cron:** `*/15 * * * *`  
**Lock TTL:** 5 minuti

**Cosa fa:**
1. Trova fixtures tra 2 e 3 ore
2. Fetch lineup da Sportsmonks
3. Se lineup completa (2 squadre), ricalcola predizione
4. Log job esecuzione

**Config:**
```env
CRON_LINEUP_REFRESH_MINUTES=120
```

**Perché 2 ore prima?**
- Lineup ufficiali disponibili ~2h prima
- Tempo per recalcolare confidence con lineup
- Injury impact aggiornato

---

### 3. **Final Update** (H-30)
Update finale 30 minuti prima del match.

**Timing:** Ogni 10 minuti (controlla fixtures H-30)  
**Cron:** `*/10 * * * *`  
**Lock TTL:** 5 minuti

**Cosa fa:**
1. Trova fixtures tra 30 e 45 minuti
2. Ricalcola predizione finale
3. Log job esecuzione

**Config:**
```env
CRON_FINAL_UPDATE_MINUTES=30
```

**Perché 30 min prima?**
- Ultimi dati disponibili (lineup confirmed, injury updates)
- Confidence massima per decisione finale
- Tempo per utenti di vedere predizione aggiornata

---

## 🔒 Redis Locks

Ogni job usa Redis lock per prevenire esecuzioni duplicate:

```typescript
const lock = new RedisLock('job-name', 600); // 10 min TTL
const acquired = await lock.acquire();

if (acquired) {
  try {
    // Execute job
  } finally {
    await lock.release();
  }
}
```

**Features:**
- `SET NX EX` atomico
- Auto-expire con TTL
- Extend TTL per job lunghi
- Log acquisizione/rilascio

---

## 📊 Job Logs

Ogni job salva log nel DB:

```typescript
await prisma.jobLog.create({
  data: {
    jobName: 'DAILY_FIXTURES',
    status: 'SUCCESS', // o 'FAILED'
    executedAt: new Date(),
    details: 'Loaded 42 fixtures, calculated 38 predictions',
  },
});
```

**Query logs:**
```sql
SELECT * FROM "JobLog" 
WHERE "jobName" = 'DAILY_FIXTURES' 
ORDER BY "executedAt" DESC 
LIMIT 10;
```

---

## 🚀 Utilizzo

### Avvio Automatico
```typescript
// server.ts
import { startScheduler } from './jobs/scheduler';

if (schedulerConfig.enabled) {
  startScheduler();
}
```

### Esecuzione Manuale
```typescript
import { dailyFixturesJob, lineupRefreshJob, finalUpdateJob } from './jobs/scheduler';

// Test job singolo
await dailyFixturesJob();
```

### Disabilita Scheduler
```env
CRON_ENABLED=false
```

---

## 🧪 Testing

### Test Job Manuale
```bash
# Avvia server
npm run dev

# In altro terminale, trigger manuale via endpoint (TODO)
curl -X POST http://localhost:3001/admin/jobs/daily-fixtures
```

### Verifica Lock
```bash
# Redis CLI
redis-cli

# Check lock esistente
EXISTS lock:daily-fixtures

# TTL rimasto
TTL lock:daily-fixtures

# Rilascia lock manualmente
DEL lock:daily-fixtures
```

### Monitor Job Logs
```bash
# PostgreSQL
psql $DATABASE_URL

# Ultimi 10 job
SELECT * FROM "JobLog" ORDER BY "executedAt" DESC LIMIT 10;

# Job falliti
SELECT * FROM "JobLog" WHERE status = 'FAILED';
```

---

## 📋 Cron Syntax

```
* * * * *
┬ ┬ ┬ ┬ ┬
│ │ │ │ │
│ │ │ │ └─── Giorno settimana (0-7, 0=domenica)
│ │ │ └───── Mese (1-12)
│ │ └─────── Giorno mese (1-31)
│ └───────── Ora (0-23)
└─────────── Minuto (0-59)
```

**Esempi:**
- `0 6 * * *` → Ogni giorno alle 06:00
- `*/15 * * * *` → Ogni 15 minuti
- `0 */2 * * *` → Ogni 2 ore
- `0 6 * * 1` → Ogni lunedì alle 06:00

---

## 🔧 Configurazione Avanzata

### Timezone
```env
CRON_TIMEZONE=Europe/Rome
```

Supportati: Tutti i timezone IANA (Europe/Rome, America/New_York, etc.)

### Leghe Multiple
```env
CRON_LEAGUE_IDS=39,135,140,78,61
```

- `39`: Premier League (England)
- `135`: Serie A (Italy)
- `140`: La Liga (Spain)
- `78`: Bundesliga (Germany)
- `61`: Ligue 1 (France)

### Custom Schedule
```env
# Daily fixtures alle 05:30
CRON_DAILY_FIXTURES=30 5 * * *

# Lineup refresh 3 ore prima
CRON_LINEUP_REFRESH_MINUTES=180

# Final update 1 ora prima
CRON_FINAL_UPDATE_MINUTES=60
```

---

## ⚠️ Error Handling

Ogni job ha:
- Try-catch per errori individuali (es: fixture singola)
- Logging errori con contesto
- Continua con prossima fixture se una fallisce
- Job log FAILED se errore critico

**Esempio:**
```typescript
for (const fixture of fixtures) {
  try {
    await processFixture(fixture);
  } catch (error) {
    logger.error({ error, fixtureId: fixture.fixtureId }, 'Failed to process fixture');
    // Continua con prossima
  }
}
```

---

## 📈 Performance

### Daily Fixtures Job
- **Tempo stimato:** 5-15 min (dipende da N fixtures)
- **Rate limiting:** 10 req/min Sportsmonks
- **Lock TTL:** 10 min (estendibile)

### Lineup Refresh Job
- **Tempo stimato:** 1-3 min
- **Frequenza check:** Ogni 15 min
- **Lock TTL:** 5 min

### Final Update Job
- **Tempo stimato:** 1-2 min
- **Frequenza check:** Ogni 10 min
- **Lock TTL:** 5 min

---

## 🚧 TODO Miglioramenti

- [ ] Admin endpoint per trigger manuale job
- [ ] Webhook per notifiche job falliti
- [ ] Retry automatico job falliti
- [ ] Job stats dashboard
- [ ] Distributed locks per multi-instance (Redis Redlock)
- [ ] Job priority queue
- [ ] Historical results update job

---

**Status:** ✅ **COMPLETO** - Step 8/9
