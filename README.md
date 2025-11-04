# ⚽ Calcio-Pred

**Sistema completo di predizioni calcistiche basato esclusivamente su dati storici reali da API-FOOTBALL.**

> 🚫 Niente quote bookmaker - Solo analisi matematica e statistica

---

## 🌟 Caratteristiche

### 🧠 Motore di Calcolo
- **Doppio motore ibrido**:
  - **60% Empirico**: Analisi ultimi 20 match con time-decay (0.95)
  - **40% Poisson**: Distribuzione probabilistica con correzione Dixon-Coles
- **Time-decay**: Partite recenti pesano di più
- **Dixon-Coles correction**: Riduce sovrastima score bassi (0-0, 1-0, 0-1, 1-1)
- **Home advantage**: +0.25 gol per squadra di casa

### 📊 Mercati Supportati
- **1X2**: Vittoria Casa / Pareggio / Vittoria Trasferta
- **Under/Over**: 0.5, 1.5, 2.5, 3.5, 4.5 gol
- **BTTS**: Goal/No Goal (entrambe segnano)
- **Doppia Chance**: 1X, 12, X2

### 🎯 Sistema di Classificazione
| Badge | Criterio | Utilizzo |
|-------|----------|----------|
| 🟩 **GIOCALA** | ≥80% + confidence ≥0.60 | Scommesse ad alta probabilità (solo 1X2) |
| 🟢 **FORTE** | Alta probabilità | Predizioni affidabili |
| 🟡 **MEDIO** | Media probabilità | Predizioni moderate |
| ⚪ **NEUTRALE** | Bassa probabilità | Predizioni incerte |
| 🔴 **ND** | Dati insufficienti | Non disponibile (<30% dati) |

### 🔍 Sistema Confidence (5 fattori)
- **Data Availability** (30%): Completezza storico (20 match = max)
- **Recency** (20%): Freschezza dati (≤30 giorni = max)
- **Stability** (25%): Bassa varianza + entropia equilibrata
- **Lineup Status** (15%): Formazioni confermate
- **Injury Impact** (10%): Assenze pesanti (titolari/star)

### ⏰ Automazione
- **06:00**: Carica fixtures giornaliere + calcola predizioni
- **H-120**: Refresh lineup 2 ore prima del match
- **H-30**: Update finale 30 minuti prima
- **Redis lock**: Previene esecuzioni duplicate

### 🚀 Performance
- **Cache Redis**: 5 min fixtures, 2 min predictions
- **Rate limiting**: 10 req/min API-FOOTBALL con retry automatico
- **Validazione Zod**: Type-safe configuration
- **Logging Pino**: Structured logging per debugging

---

## 🏗️ Architettura

```
calcio-pred/
├── api/                          # Backend (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── config/              # Configurazione Zod
│   │   ├── lib/                 # Prisma, Redis singletons
│   │   ├── utils/               # Logger, RedisLock
│   │   ├── types/               # TypeScript types
│   │   ├── services/
│   │   │   ├── api-football/   # Client API-FOOTBALL (7 modules)
│   │   │   └── prediction/     # Motore predizioni (6 modules)
│   │   ├── routes/              # Express routes
│   │   ├── jobs/                # Cron scheduler (3 jobs)
│   │   └── server.ts            # Entry point
│   ├── prisma/                  # Schema + migrations
│   └── package.json
├── frontend/                     # Frontend (Next.js 14 + TypeScript)
│   ├── src/
│   │   ├── app/                 # Next.js App Router
│   │   ├── components/          # React components (Table, Badge, Tooltip)
│   │   ├── lib/                 # TanStack Query hooks
│   │   └── types/               # Frontend types
│   └── package.json
├── infra/                        # Docker + Scripts
│   ├── docker-compose.yml       # 4 services (Postgres, Redis, API, Frontend)
│   ├── Dockerfile.api           # Multi-stage build API
│   ├── Dockerfile.frontend      # Next.js standalone
│   ├── backup-db.ps1            # PostgreSQL backup
│   └── health-check.ps1         # Service health check
└── package.json                  # Root workspace
```

---

## 🚀 Quick Start

### Prerequisiti
- **Node.js** ≥ 18.x
- **Docker** + Docker Compose
- **API-FOOTBALL Key** (da [api-football.com](https://www.api-football.com/))

---

### 1️⃣ Setup Locale (Development)

#### Clona Repository
```bash
git clone https://github.com/yourusername/calcio-pred.git
cd calcio-pred
```

#### Installa Dipendenze
```bash
npm install
```

#### Configura Environment
```bash
# Backend
cp api/.env.example api/.env

# Modifica api/.env con i tuoi valori
# APIFOOTBALL_KEY=your_api_key_here
# DATABASE_URL=postgresql://user:password@localhost:5432/calciopred
# REDIS_URL=redis://localhost:6379

# Frontend
cp frontend/.env.example frontend/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### Avvia Database (Docker)
```bash
cd infra
docker-compose up -d postgres redis
```

#### Setup Database
```bash
cd ../api
npx prisma generate
npx prisma migrate dev
```

#### Avvia Backend
```bash
npm run dev
# Server: http://localhost:3001
```

#### Avvia Frontend (altro terminale)
```bash
cd ../frontend
npm run dev
# App: http://localhost:3000
```

---

### 2️⃣ Setup Docker (Production)

#### Configura Environment
```bash
cp infra/.env.example infra/.env
# Modifica infra/.env con i tuoi valori
```

#### Build e Start
```bash
cd infra
docker-compose up --build -d
```

#### Verifica Servizi
```bash
docker-compose ps

# Output atteso:
# postgres    running   5432->5432
# redis       running   6379->6379
# api         running   3001->3001
# frontend    running   3000->3000
```

#### Check Health
```bash
# API
curl http://localhost:3001/health

# Frontend
curl http://localhost:3000

# Database
docker exec -it calcio-pred-postgres psql -U calciopred -c "SELECT 1"

# Redis
docker exec -it calcio-pred-redis redis-cli PING
```

#### Logs
```bash
# Tutti i servizi
docker-compose logs -f

# Solo API
docker-compose logs -f api

# Solo Frontend
docker-compose logs -f frontend
```

---

## 📚 Documentazione Moduli

### Backend
- [**Config**](api/src/config/index.ts) - Configurazione Zod con 70+ variabili
- [**API-FOOTBALL Client**](api/src/services/api-football/README.md) - 7 moduli per fetching dati
- [**Prediction Engine**](api/src/services/prediction/README.md) - 6 moduli calcolo predizioni
- [**API Routes**](api/src/routes/README.md) - 4 endpoints REST
- [**Cron Scheduler**](api/src/jobs/README.md) - 3 job automatici
- [**Prisma Schema**](api/prisma/README.md) - 8 models database

### Frontend
- [**Frontend Guide**](frontend/README.md) - Next.js + TanStack Query + Tailwind

### Infrastructure
- [**Docker Guide**](infra/README.md) - Docker Compose + scripts utility

---

## 🧪 Testing API

### Health Check
```bash
curl http://localhost:3001/health
```

### Fixtures
```bash
# Oggi
curl http://localhost:3001/api/fixtures

# Prossimi 3 giorni
curl http://localhost:3001/api/fixtures?days=3

# Serie A
curl http://localhost:3001/api/fixtures?leagueId=135&season=2024

# Singola fixture
curl http://localhost:3001/api/fixtures/1234
```

### Predictions
```bash
# Tutte le predizioni di oggi
curl http://localhost:3001/api/predictions

# Solo GIOCALA
curl "http://localhost:3001/api/predictions?strengthFilter=GIOCALA"

# GIOCALA + STRONG
curl "http://localhost:3001/api/predictions?strengthFilter=STRONG_PLUS"

# Confidence minima 65%
curl "http://localhost:3001/api/predictions?minConfidence=0.65"

# Prossimi 3 giorni
curl "http://localhost:3001/api/predictions?days=3"

# Singola predizione
curl http://localhost:3001/api/predictions/1234
```

### Calcola Predizione
```bash
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "fixtureId": 1234,
    "homeTeamId": 487,
    "awayTeamId": 489,
    "season": 2024,
    "leagueId": 135
  }'
```

---

## 🎨 Frontend Features

### Dashboard
- **URL**: http://localhost:3000
- **Tabella partite** con predizioni in tempo reale
- **Filtri**:
  - Tutte / Solo GIOCALA / Forti + Giocala
  - Periodo: Oggi / Domani / Prossimi 2-7 giorni
- **Badge colorati** per forza predizione
- **Tooltip hover** con dettagli (match count, confidence, data quality, lineup, injuries)
- **Auto-refresh** ogni 2 minuti

### Legenda Badge
- 🟩 **GIOCALA**: ≥80% probabilità + confidence ≥60%
- 🟢 **FORTE**: Alta probabilità
- 🟡 **MEDIO**: Media probabilità
- ⚪ **NEUTRALE**: Bassa probabilità
- 🔴 **ND**: Dati insufficienti

---

## ⚙️ Configurazione Avanzata

### API-FOOTBALL
```env
APIFOOTBALL_BASE=https://v3.football.api-sports.io
APIFOOTBALL_KEY=your_api_key_here
API_RATE_LIMIT_PER_MINUTE=10
API_REQUEST_DELAY=6000
```

### Calcolo Predizioni
```env
HISTORY_GAMES=20              # Match storici analizzati
HOME_ADV_GOALS=0.25           # Vantaggio casalingo
BLEND_EMPIRIC=0.6             # Peso empirico
BLEND_POISSON=0.4             # Peso Poisson
CONFIDENCE_MIN=0.60           # Confidence minima GIOCALA
```

### Soglie Classificazione
```env
THRESHOLD_GIOCALA=80          # GIOCALA 1X2 (%)
THRESHOLD_1X2_STRONG=50       # STRONG 1X2 (%)
THRESHOLD_1X2_MEDIUM=42       # MEDIUM 1X2 (%)
THRESHOLD_BINARY_STRONG=62    # STRONG U/O, BTTS (%)
THRESHOLD_BINARY_MEDIUM=55    # MEDIUM U/O, BTTS (%)
THRESHOLD_DC_STRONG=75        # STRONG Doppia Chance (%)
THRESHOLD_DC_MEDIUM=65        # MEDIUM Doppia Chance (%)
```

### Scheduler
```env
CRON_ENABLED=true
CRON_TIMEZONE=Europe/Rome
CRON_DAILY_FIXTURES=0 6 * * *
CRON_LINEUP_REFRESH_MINUTES=120
CRON_FINAL_UPDATE_MINUTES=30
CRON_LEAGUE_IDS=39,135,140,78,61  # Premier,Serie A,La Liga,Bundesliga,Ligue 1
```

---

## 🔧 Troubleshooting

### Errore: "Cannot find module"
```bash
# Reinstalla dipendenze
cd api && npm install
cd ../frontend && npm install
```

### Errore: "Prisma Client not generated"
```bash
cd api
npx prisma generate
```

### Errore: "Database connection failed"
```bash
# Verifica PostgreSQL
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Errore: "Redis connection failed"
```bash
# Verifica Redis
docker exec calcio-pred-redis redis-cli PING

# Dovrebbe rispondere: PONG

# Restart
docker-compose restart redis
```

### Errore: "API-FOOTBALL rate limit"
```bash
# Verifica rate limit in .env
API_RATE_LIMIT_PER_MINUTE=10
API_REQUEST_DELAY=6000

# Il sistema usa retry automatico con exponential backoff
```

### Job Scheduler non parte
```bash
# Verifica config
grep CRON_ENABLED api/.env

# Dovrebbe essere: CRON_ENABLED=true

# Check logs
docker-compose logs api | grep -i "cron\|scheduler"
```

### Frontend non carica dati
```bash
# Verifica CORS
grep CORS_ORIGIN api/.env

# Dovrebbe includere: http://localhost:3000

# Verifica API URL frontend
grep NEXT_PUBLIC_API_URL frontend/.env.local

# Dovrebbe essere: NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 📊 Database Schema

### Principali Modelli
- **Team**: Squadre (teamId, name, logo)
- **Fixture**: Partite (fixtureId, date, homeTeam, awayTeam, status)
- **Prediction**: Predizioni complete (70+ campi per tutti i mercati)
- **MatchHistory**: Storico match per calcoli empirici
- **PlayerInjury**: Infortuni giocatori
- **LineupStatus**: Status formazioni
- **ApiCache**: Cache API-FOOTBALL
- **JobLog**: Log job scheduler

### Query Utili
```sql
-- Predizioni GIOCALA oggi
SELECT f."homeTeam".name, f."awayTeam".name, p."finalProb1", p.confidence
FROM "Prediction" p
JOIN "Fixture" f ON f."fixtureId" = p."fixtureId"
WHERE DATE(f.date) = CURRENT_DATE
  AND p."strength1X2" = 'GIOCALA';

-- Job eseguiti oggi
SELECT * FROM "JobLog"
WHERE DATE("executedAt") = CURRENT_DATE
ORDER BY "executedAt" DESC;

-- Cache hit rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN "lastUsed" > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END) as recent
FROM "ApiCache";
```

---

## 📈 Performance

### Backend
- **Response time**: <100ms (con cache)
- **Rate limiting**: 10 req/min API-FOOTBALL
- **Cache TTL**: 5 min fixtures, 2 min predictions
- **Database**: Connection pooling Prisma

### Frontend
- **First Load**: ~2s
- **Auto-refresh**: Ogni 2 minuti
- **TanStack Query**: Stale time 2-5 min
- **Bundle size**: ~200KB (gzipped)

### Docker
- **Build time**: ~5-10 min (first build)
- **Memory**: ~1GB total (4 containers)
- **CPU**: <10% idle

---

## 🚧 Roadmap

### v1.1 (Q1 2025)
- [ ] Machine Learning (XGBoost) come 3° motore
- [ ] Analisi scontri diretti (head-to-head)
- [ ] Form recente (ultimi 5 match)
- [ ] Mobile app (React Native)

### v1.2 (Q2 2025)
- [ ] Multi-currency betting tracker
- [ ] Historical results validation
- [ ] Performance analytics dashboard
- [ ] Telegram bot notifications

### v2.0 (Q3 2025)
- [ ] Live match tracking
- [ ] In-play predictions
- [ ] User authentication
- [ ] Community predictions

---

## 🤝 Contributing

Contributi benvenuti! Per favore:
1. Fork repository
2. Crea feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing`)
5. Apri Pull Request

---

## 📄 License

MIT License - vedi [LICENSE](LICENSE)

---

## 🙏 Credits

- **API-FOOTBALL**: Dati calcistici ([api-football.com](https://www.api-football.com/))
- **Dixon-Coles Model**: Paper "Modelling Association Football Scores and Inefficiencies in the Football Betting Market" (1997)
- **Next.js**: Framework React ([nextjs.org](https://nextjs.org/))
- **Prisma**: ORM TypeScript ([prisma.io](https://www.prisma.io/))
- **TanStack Query**: Data fetching React ([tanstack.com/query](https://tanstack.com/query))

---

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/calcio-pred/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/calcio-pred/discussions)
- **Email**: support@calcio-pred.com

---

**Made with ❤️ by [Your Name]**

**⚽ Calcio-Pred** - Predizioni calcio basate su matematica, non fortuna.
- Docker & Docker Compose
- Account API-FOOTBALL (https://www.api-football.com/)

### 1. Configurazione

```bash
# Copia i file .env.example
cp api/.env.example api/.env
cp frontend/.env.example frontend/.env.local

# Modifica api/.env con le tue credenziali API-FOOTBALL
```

### 2. Avvio con Docker

```bash
# Avvia tutti i servizi
npm run docker:up

# Vedi i log
npm run docker:logs

# Ferma i servizi
npm run docker:down
```

### 3. Sviluppo locale

```bash
# Installa dipendenze
npm install

# Avvia database e Redis
npm run docker:up

# Esegui migrazioni database
npm run prisma:migrate -w api

# Avvia dev server (API + Frontend)
npm run dev
```

## 📊 API Endpoints

- `GET /api/fixtures?date=YYYY-MM-DD` - Lista partite del giorno
- `GET /api/predictions?date=YYYY-MM-DD` - Predizioni per data
- `GET /api/predictions/:fixtureId` - Dettaglio predizione singola partita

## 🔧 Variabili d'ambiente

Vedi `.env.example` per la lista completa. Principali:

- `APIFOOTBALL_KEY`: La tua API key
- `HISTORY_GAMES=20`: Numero di partite storiche da analizzare
- `HOME_ADV_GOALS=0.20`: Vantaggio casa (gol)
- `CONFIDENCE_MIN=0.60`: Soglia minima confidence per badge GIOCALA
- `BLEND_EMPIRIC=0.6`: Peso analisi empirica
- `BLEND_POISSON=0.4`: Peso modello Poisson

## 📅 Job Automatici

- **06:00**: Caricamento partite del giorno
- **H-120** (2 ore prima): Refresh lineup/infortuni + ricalcolo
- **H-30** (30 min prima): Update finale

## 🎯 Classificazione Forza

### 🟩 GIOCALA (≥80%, confidence ≥0.60)
La predizione più affidabile

### 🟢 FORTE
- 1X2: ≥50%
- Under/Over, BTTS: ≥62%
- Doppia Chance: ≥75%

### 🟡 MEDIA
- 1X2: 42-49%
- Under/Over, BTTS: 55-61%
- Doppia Chance: 65-74%

### ⚪ NEUTRA
Sotto le soglie MEDIA

### 🔴 ND
Dati insufficienti

## 📝 Licenza

MIT

## 🙏 Crediti

Powered by [API-FOOTBALL](https://www.api-football.com/)
