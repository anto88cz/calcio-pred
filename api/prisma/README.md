# Prisma Database Setup

## 🚀 Quick Start

### 1. Primo Setup

```powershell
# Dalla cartella api/
cd api

# Genera Prisma Client
npm run prisma:generate

# Crea e applica la migrazione iniziale
npm run prisma:migrate

# (Opzionale) Apri Prisma Studio per vedere il database
npm run prisma:studio
```

### 2. Durante lo Sviluppo

```powershell
# Dopo modifiche allo schema
npm run prisma:migrate

# Regenera il client dopo modifiche
npm run prisma:generate

# Reset completo del database (ATTENZIONE: cancella tutti i dati!)
npx prisma migrate reset

# Seed del database con dati di test
npx prisma db seed
```

## 📊 Schema Overview

### Modelli Principali

#### **Team** (Squadre)
- Anagrafica squadre con statistiche aggregate
- ID univoco da API-FOOTBALL
- Relazioni con fixtures e match history

#### **Fixture** (Partite)
- Partite programmate/in corso/concluse
- Status tracking e metadata
- Link a predizioni, infortuni, lineup

#### **MatchHistory** (Storico)
- Storico partite concluse per analisi
- Statistiche avanzate (possesso, tiri, corner, etc.)
- Usato per calcoli empirici e Poisson

#### **Prediction** (Predizioni)
- Probabilità per tutti i mercati (1X2, U/O, BTTS, DC)
- Separazione Empirico/Poisson/Media
- Classificazione forza e confidence
- Parametri lambda per Poisson

#### **PlayerInjury** (Infortuni)
- Tracking infortuni/squalifiche/assenze
- Link a fixture e team
- Impact sulla confidence

#### **LineupStatus** (Formazioni)
- Status conferma lineup
- Formazioni tattiche
- Key players tracking

#### **ApiCache** (Cache)
- Cache response API-FOOTBALL
- Rate limiting e ottimizzazione

#### **JobLog** (Log Job)
- Tracking esecuzione job schedulati
- Statistiche e error handling

## 🔍 Query Utili

### Squadre

```sql
-- Trova squadra per nome
SELECT * FROM teams WHERE name ILIKE '%juventus%';

-- Statistiche squadre migliori
SELECT name, "goalsScored", "goalsConceded", "matchesPlayed",
       ROUND(CAST("goalsScored" AS DECIMAL) / NULLIF("matchesPlayed", 0), 2) as avg_goals
FROM teams
WHERE "matchesPlayed" > 0
ORDER BY avg_goals DESC
LIMIT 10;
```

### Fixtures

```sql
-- Partite di oggi
SELECT 
  f.id,
  ht.name as home,
  at.name as away,
  f.date,
  f.status
FROM fixtures f
JOIN teams ht ON f."homeTeamId" = ht.id
JOIN teams at ON f."awayTeamId" = at.id
WHERE DATE(f.date) = CURRENT_DATE
ORDER BY f.date;

-- Partite con predizioni GIOCALA
SELECT 
  f.id,
  ht.name as home,
  at.name as away,
  p."prob1Final",
  p."probXFinal",
  p."prob2Final",
  p.confidence,
  p."strength1X2"
FROM fixtures f
JOIN teams ht ON f."homeTeamId" = ht.id
JOIN teams at ON f."awayTeamId" = at.id
JOIN predictions p ON f.id = p."fixtureId"
WHERE p."strength1X2" = 'GIOCALA'
ORDER BY p.confidence DESC;
```

### Match History

```sql
-- Ultime 20 partite di una squadra
SELECT 
  mh.date,
  ht.name as home,
  at.name as away,
  mh."homeGoals",
  mh."awayGoals",
  mh."isHome"
FROM match_history mh
JOIN teams ht ON mh."homeTeamId" = ht.id
JOIN teams at ON mh."awayTeamId" = at.id
WHERE mh."homeTeamId" = 123 OR mh."awayTeamId" = 123
ORDER BY mh.date DESC
LIMIT 20;
```

### Predictions

```sql
-- Migliori predizioni Over 2.5
SELECT 
  f.date,
  ht.name as home,
  at.name as away,
  p."probOver25Final" * 100 as over_25_pct,
  p."strengthOver25",
  p.confidence
FROM predictions p
JOIN fixtures f ON p."fixtureId" = f.id
JOIN teams ht ON f."homeTeamId" = ht.id
JOIN teams at ON f."awayTeamId" = at.id
WHERE p."strengthOver25" IN ('GIOCALA', 'STRONG')
  AND DATE(f.date) = CURRENT_DATE
ORDER BY p."probOver25Final" DESC;
```

## 🛠️ Manutenzione

### Backup

```powershell
# Esporta schema
npx prisma db pull

# Backup completo con pg_dump (vedi infra/backup-db.ps1)
.\infra\backup-db.ps1
```

### Ottimizzazione

```sql
-- Vacuum database
VACUUM ANALYZE;

-- Reindex
REINDEX DATABASE calciopred;

-- Statistiche tabelle
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Cleanup

```sql
-- Rimuovi cache scaduta
DELETE FROM api_cache WHERE "expiresAt" < NOW();

-- Rimuovi log vecchi (>30 giorni)
DELETE FROM job_logs WHERE "startedAt" < NOW() - INTERVAL '30 days';

-- Rimuovi fixtures molto vecchie (>2 anni)
DELETE FROM fixtures WHERE date < NOW() - INTERVAL '2 years';
```

## 📝 Note Importanti

1. **Indici**: Schema ottimizzato con indici su colonne frequentemente queriate
2. **Cascade Delete**: Fixture eliminate cancellano automaticamente predizioni/infortuni/lineup
3. **Timestamps**: Tutti i modelli hanno `createdAt` e `updatedAt` automatici
4. **Enum**: Status e classificazioni tipizzati per sicurezza
5. **JSON Fields**: Usati per dati flessibili (key players, cache)

## 🔗 Relazioni

```
Team 1──N Fixture (home)
Team 1──N Fixture (away)
Team 1──N MatchHistory (home)
Team 1──N MatchHistory (away)

Fixture 1──1 Prediction
Fixture 1──N PlayerInjury
Fixture 1──1 LineupStatus
```

## 🎯 Best Practices

- Usa `prisma.generate()` dopo ogni modifica schema
- Testa le migrazioni in dev prima di produzione
- Backup regolare del database
- Monitora dimensione cache e pulisci periodicamente
- Usa transazioni per operazioni multiple correlate
- Approfitta degli indici per query veloci
