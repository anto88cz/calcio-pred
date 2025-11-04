# 📊 Schema Prisma - Calcio-Pred

## ✅ Completato

Lo schema del database è stato definito con successo! Include tutti i modelli necessari per il sistema di predizioni calcistiche.

## 🗄️ Modelli Principali

### 1. **Team** (Squadre)
- ✅ Anagrafica completa con ID API-FOOTBALL
- ✅ Statistiche aggregate (gol, partite)
- ✅ Relazioni con fixtures e match history

### 2. **Fixture** (Partite)
```typescript
- ID univoco API-FOOTBALL
- Data/ora con timezone
- Squadre (home/away)
- Status (SCHEDULED, LIVE, FINISHED, etc.)
- Risultato (se conclusa)
- Flags: isOfficial, isSuspended, hasLineup
```

### 3. **MatchHistory** (Storico Partite)
```typescript
- Storico partite concluse
- Statistiche avanzate:
  * Possesso palla
  * Tiri in porta
  * Corner
  * Cartellini
- Usato per calcoli empirici e Poisson
```

### 4. **Prediction** (Predizioni)
```typescript
- Probabilità per TUTTI i mercati:
  * 1X2 (Empirico, Poisson, Media finale)
  * Under/Over (0.5, 1.5, 2.5, 3.5, 4.5)
  * BTTS (Yes/No)
  * Doppia Chance (1X, 12, X2)

- Per ogni mercato:
  * 3 calcoli (Empirico/Poisson/Final)
  * Classificazione forza (GIOCALA/STRONG/MEDIUM/NEUTRAL/ND)

- Confidence:
  * Valore 0-1
  * Livello (VERY_LOW, LOW, MEDIUM, HIGH, VERY_HIGH)
  
- Parametri Poisson:
  * lambdaHome (gol attesi casa)
  * lambdaAway (gol attesi trasferta)
  * homeAdvantage (vantaggio casa)

- Metadata:
  * dataQuality (EXCELLENT → INSUFFICIENT)
  * hasInjuries, hasLineup
  * provider, timestamp
```

### 5. **PlayerInjury** (Infortuni)
```typescript
- Infortuni/squalifiche/assenze
- Info giocatore (nome, numero, ruolo)
- Tipo (Injury, Doubtful, Suspended, Missing)
- Impatto su confidence
```

### 6. **LineupStatus** (Formazioni)
```typescript
- Status conferma lineup (home/away)
- Formazioni tattiche (es: "4-3-3")
- Conteggio giocatori (titolari/riserve)
- Key players tracking (JSON)
```

### 7. **ApiCache** (Cache)
```typescript
- Cache response API-FOOTBALL
- Gestione TTL e rate limiting
- Hit count tracking
```

### 8. **JobLog** (Log Job Schedulati)
```typescript
- Tracking esecuzione job
- Tipi: DAILY_FIXTURES, LINEUP_REFRESH, FINAL_UPDATE
- Status: RUNNING, SUCCESS, FAILED, PARTIAL
- Statistiche: items processed/failed
- Timing: duration, timestamps
```

## 🎯 Enumerazioni (Enums)

### FixtureStatus
- `SCHEDULED` - Non ancora iniziata
- `LIVE` - In corso
- `FINISHED` - Conclusa
- `POSTPONED` - Posticipata
- `CANCELLED` - Cancellata
- `SUSPENDED` - Sospesa

### PredictionStrength
- `GIOCALA` 🟩 - ≥80% (solo se confidence ≥0.60)
- `STRONG` 🟢 - Soglie forti
- `MEDIUM` 🟡 - Soglie medie
- `NEUTRAL` ⚪ - Sotto soglie
- `ND` 🔴 - Dati insufficienti

### ConfidenceLevel
- `VERY_LOW` - < 0.3
- `LOW` - 0.3 - 0.5
- `MEDIUM` - 0.5 - 0.7
- `HIGH` - 0.7 - 0.85
- `VERY_HIGH` - > 0.85

### DataQuality
- `EXCELLENT` - Tutti i dati disponibili
- `GOOD` - Dati completi con piccole lacune
- `FAIR` - Alcuni dati mancanti
- `POOR` - Molti dati mancanti
- `INSUFFICIENT` - Troppi dati mancanti

## 🔗 Relazioni

```
Team
  ├── 1:N → Fixture (homeTeam)
  ├── 1:N → Fixture (awayTeam)
  ├── 1:N → MatchHistory (homeTeam)
  └── 1:N → MatchHistory (awayTeam)

Fixture
  ├── 1:1 → Prediction
  ├── 1:N → PlayerInjury
  └── 1:1 → LineupStatus
```

## 📊 Indici Ottimizzati

Tutti i modelli hanno indici su:
- Foreign keys (teamId, fixtureId, etc.)
- Campi frequentemente filtrati (date, status, confidence)
- Chiavi API esterne (apiId, apiFixtureId)

## 🚀 Prossimi Passi

Per utilizzare lo schema:

1. **Installa dipendenze** (se non già fatto):
```powershell
cd api
npm install
```

2. **Genera Prisma Client**:
```powershell
npm run prisma:generate
```

3. **Crea e applica migrazione**:
```powershell
npm run prisma:migrate
```

4. **Verifica con Prisma Studio**:
```powershell
npm run prisma:studio
# Apre GUI su http://localhost:5555
```

## 📝 Files Creati

```
api/
├── prisma/
│   ├── schema.prisma              ✅ Schema completo
│   ├── migrations/
│   │   └── 00_init/
│   │       └── migration.sql      ✅ SQL iniziale
│   └── README.md                  ✅ Documentazione
│
└── src/
    ├── config/
    │   └── index.ts               ✅ Configurazione app
    ├── lib/
    │   ├── prisma.ts              ✅ Prisma singleton
    │   └── redis.ts               ✅ Redis singleton
    ├── types/
    │   └── index.ts               ✅ TypeScript types
    └── utils/
        └── logger.ts              ✅ Pino logger
```

## 💡 Note Tecniche

1. **Cascade Delete**: Eliminare una Fixture cancella automaticamente predizioni, infortuni e lineup
2. **Timestamps**: Tutti i modelli hanno `createdAt` e `updatedAt` automatici
3. **JSON Fields**: Usati per dati flessibili (key players, cache API)
4. **Type Safety**: Tutti i campi tipizzati, enum per valori fissi
5. **Ottimizzazioni**: Indici strategici per query veloci

## 🎉 Pronto per il Prossimo Step!

Lo schema è completo e pronto per:
- ✅ Client API-FOOTBALL
- ✅ Motore di calcolo (Empirico + Poisson)
- ✅ API routes
- ✅ Job schedulati
