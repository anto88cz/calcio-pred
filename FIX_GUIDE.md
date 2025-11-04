# 🔧 FIX RIMANENTI - Calcio-Pred Backend

## 📊 Progresso: 146 → 39 errori (73% risolti!)

### ✅ Già Fixati
- ✅ Prisma client regenerato
- ✅ Schema updated: venue, referee, NS status, executedAt
- ✅ Scheduler: usa mapAPIFixturesToFlat
- ✅ Config: CORS_ORIGIN, PORT, NODE_ENV
- ✅ Types: UnderOverMarket, DoubleChanceMarket separati
- ✅ Imports: prisma, redis, logger exports corretti

---

## ⚠️ 39 Errori Rimanenti - Quick Fix Guide

### 1️⃣ **Scheduler.ts - Fixture Fields** (12 errori)

**Problema:** Il codice usa `fixture.fixtureId` e `fixture.season` ma il DB Prisma usa `fixture.apiId` e `fixture.leagueSeason`.

**Fix:** Nei job 2 e 3 (lineup refresh e final update), quando leggi fixtures dal DB:

```typescript
// BEFORE:
const fixtures = await prisma.fixture.findMany({...});
for (const fixture of fixtures) {
  await predictionEngine.calculatePrediction({
    fixtureId: fixture.fixtureId, // ❌ Non esiste
    season: fixture.season,        // ❌ Non esiste
  });
}

// AFTER:
const fixtures = await prisma.fixture.findMany({...});
for (const fixture of fixtures) {
  await predictionEngine.calculatePrediction({
    fixtureId: fixture.apiId,         // ✅ Corretto
    season: fixture.leagueSeason,     // ✅ Corretto
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    leagueId: fixture.leagueId,
  });
}
```

**Righe da fixare:**
- Riga 208, 213, 216, 220, 224 (Job 2 - Lineup Refresh)
- Riga 284, 287, 291, 294 (Job 3 - Final Update)

---

### 2️⃣ **Scheduler.ts - JobLog.details** (3 errori)

**Problema:** `details` non esiste in JobLog, usare `errorDetails`.

**Fix:**
```typescript
// BEFORE:
await prisma.jobLog.create({
  data: {
    details: error.message, // ❌
  }
});

// AFTER:
await prisma.jobLog.create({
  data: {
    errorDetails: error.message, // ✅
    message: error.message, // Opzionale
  }
});
```

**Righe da fixare:** 158, 233, 303

---

### 3️⃣ **Scheduler.ts - savedFixture non usato** (1 errore)

**Problema:** Variabile dichiarata ma mai usata (riga 74).

**Fix:** Il savedFixture era necessario per usare `savedFixture.id` nella predizione. Controlla che sia usato nel loop.

---

### 4️⃣ **Routes/fixtures.routes.ts - Field Names** (8 errori)

**Problema:** Stesso issue - `fixtureId` vs `apiId`, `teamId` vs `apiId`.

**Fix nelle routes:**
```typescript
// BEFORE:
const fixture = await prisma.fixture.findUnique({
  where: { fixtureId: id }, // ❌
});

await prisma.team.upsert({
  where: { teamId: teamId }, // ❌
});

// AFTER:
const fixture = await prisma.fixture.findUnique({
  where: { apiId: id }, // ✅
});

await prisma.team.upsert({
  where: { apiId: teamId }, // ✅
});
```

**Righe da fixare:**
- 100, 108 - fixtureId → apiId
- 125, 128, 135 - teamId → apiId

---

### 5️⃣ **Routes - Missing Return Statements** (1 errore)

**Problema:** Funzione non restituisce valore in tutti i path.

**Fix:** Riga 29 in fixtures.routes.ts
```typescript
// BEFORE:
async (req, res) => {
  try {
    // ... codice
  } catch (error) {
    res.status(500).json({ error });
    // ❌ Manca return
  }
}

// AFTER:
async (req, res) => {
  try {
    // ... codice
  } catch (error) {
    return res.status(500).json({ error }); // ✅
  }
}
```

---

### 6️⃣ **Routes - getFixturesByLeagueAndDate** (1 errore)

**Problema:** Metodo non esiste in FixturesService.

**Fix:** Riga 91
```typescript
// BEFORE:
const fixtures = await fixturesService.getFixturesByLeagueAndDate(leagueId, date); // ❌

// AFTER:
const fixtures = await fixturesService.getFixturesByLeague(leagueId, season, {
  from: date,
  to: date
}); // ✅
```

---

### 7️⃣ **Routes/predictions.routes.ts** (13 errori)

Stessi problemi:
- Return statements mancanti
- Parameter `any` types
- Stesse fix di sopra

---

## 🚀 Quick Fix Script

Esegui questo PowerShell per applicare tutti i fix:

```powershell
cd c:\Users\Utente\Desktop\bot\calcio-pred\api\src

# Fix 1: Scheduler - fixtureId → apiId
(Get-Content jobs\scheduler.ts) -replace 'fixture\.fixtureId', 'fixture.apiId' | Set-Content jobs\scheduler.ts

# Fix 2: Scheduler - season → leagueSeason
(Get-Content jobs\scheduler.ts) -replace 'fixture\.season', 'fixture.leagueSeason' | Set-Content jobs\scheduler.ts

# Fix 3: Scheduler - details → errorDetails
(Get-Content jobs\scheduler.ts) -replace 'details:', 'errorDetails:' | Set-Content jobs\scheduler.ts

# Fix 4: Routes - fixtureId → apiId in where clauses
(Get-Content routes\fixtures.routes.ts) -replace 'where: \{ fixtureId:', 'where: { apiId:' | Set-Content routes\fixtures.routes.ts

# Fix 5: Routes - teamId → apiId
(Get-Content routes\fixtures.routes.ts) -replace 'where: \{ teamId:', 'where: { apiId:' | Set-Content routes\fixtures.routes.ts
(Get-Content routes\fixtures.routes.ts) -replace 'teamId: teamId', 'apiId: teamId' | Set-Content routes\fixtures.routes.ts

# Rebuild
npm run build
```

---

## ✅ Dopo i Fix

1. **Rigenera Prisma** (se modifichi schema):
   ```bash
   npx prisma generate
   ```

2. **Test build**:
   ```bash
   npm run build
   ```

3. **Se 0 errori, avvia Docker**:
   ```bash
   cd ..
   docker-compose up --build
   ```

---

## 📝 Note Importanti

### Prisma Model Mappings

| Codice Use | Prisma Field |
|------------|-------------|
| `fixtureId` | `apiId` |
| `teamId` | `apiId` |
| `season` | `leagueSeason` |
| `details` | `errorDetails` |
| Status "NS" | ✅ Aggiunto all'enum |
| `venue`, `referee` | ✅ Aggiunti al model |
| `executedAt` | ✅ Aggiunto a JobLog |

### Prediction Engine Input

Il `predictionEngine.calculatePrediction()` si aspetta:
```typescript
{
  fixtureId: number,    // API-FOOTBALL ID (non DB internal ID!)
  homeTeamId: number,   // API-FOOTBALL ID
  awayTeamId: number,   // API-FOOTBALL ID
  season: number,       // Anno stagione (2023, 2024, etc.)
  leagueId: number      // API-FOOTBALL League ID
}
```

**Importante:** Quando recuperi da Prisma:
- `fixture.apiId` → diventa `fixtureId` nell'input
- `fixture.leagueSeason` → diventa `season` nell'input

---

## 🎯 Stima Tempo Rimanente

- Script automatico: **2 minuti**
- Fix manuale (se script non funziona): **20 minuti**
- Test + Docker build: **5 minuti**

**Totale:** 7-27 minuti per completare

---

## 🆘 Se Hai Problemi

1. **Troppi errori ancora?**
   - Controlla che Prisma sia rigenerato: `npx prisma generate`
   - Verifica che i file modificati siano salvati
   
2. **Docker non builda?**
   - Fix prima tutti i TypeScript errors
   - Check `npm run build` funziona

3. **API non parte?**
   - Controlla `.env` con API_FOOTBALL_KEY
   - Verifica PostgreSQL e Redis sono up

---

**Status attuale:** 39 errori, tutti documentati con fix pronti! 🎯
