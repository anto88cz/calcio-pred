# 🚀 Guida al Deployment - Calcio-Pred

## 📋 Indice
1. [Pre-requisiti](#pre-requisiti)
2. [Configurazione Unico File .env](#configurazione-unico-file-env)
3. [Deployment Vercel](#deployment-vercel)
4. [Deployment Manuale](#deployment-manuale)
5. [Sicurezza](#sicurezza)
6. [Testing](#testing)

---

## Pre-requisiti

- Node.js 18+ installato
- Account Vercel (consigliato) o server con Node.js
- Backend API in esecuzione e accessibile
- Redis configurato per il caching
- PostgreSQL per il database

---

## Configurazione Unico File .env

**⚠️ IMPORTANTE: Esiste un UNICO file `.env` nella cartella `api/`**

Il frontend non ha file `.env` - tutto è centralizzato nel backend.

### File: `api/.env`

```bash
# ==================================
# Database Configuration
# ==================================
DATABASE_URL=postgresql://user:password@localhost:5432/calciopred?schema=public

# ==================================
# Redis Configuration
# ==================================
REDIS_URL=redis://localhost:6379

# ==================================
# Server Configuration
# ==================================
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://tuosito.com

# ==================================
# Authentication
# ==================================
# Password per accedere all'applicazione frontend
# IMPORTANTE: Cambia questa password in produzione!
NEXT_PUBLIC_APP_PASSWORD=TuaPasswordSicura123!

# ==================================
# The Odds API
# ==================================
ODDS_API_BASE=https://api.the-odds-api.com
ODDS_API_KEY=tua_chiave_api
ODDS_API_REGIONS=eu
ODDS_API_MARKETS=h2h,totals
ODDS_API_CACHE_TTL=1800

# ==================================
# Sportsmonks API
# ==================================
SPORTSMONKS_BASE_URL=https://api.sportmonks.com/v3/football
SPORTSMONKS_API_KEY=tua_chiave_sportsmonks

# ... altre configurazioni ...
```

**Il frontend leggerà la password chiamando l'endpoint `/api/auth/config` del backend.**

---

## Deployment Vercel

### Backend (API)

```bash
cd api
npm install
npm run build

# Vercel deploy
vercel

# Configura environment variables su Vercel Dashboard:
# - DATABASE_URL
# - REDIS_URL
# - NEXT_PUBLIC_APP_PASSWORD
# - SPORTSMONKS_API_KEY
# - etc.

vercel --prod
```

### Frontend

```bash
cd frontend
npm install
npm run build

# Configura SOLO questa variabile su Vercel:
# NEXT_PUBLIC_API_URL=https://tuo-backend.vercel.app

vercel --prod
```

**Non servono altre variabili d'ambiente nel frontend - tutto viene dal backend.**

---

## Deployment Manuale

### Su VPS/Server Linux

#### 1. Backend API

```bash
cd api

# Configura .env
nano .env  # Imposta NEXT_PUBLIC_APP_PASSWORD, DATABASE_URL, REDIS_URL, etc.

# Installa e builda
npm install
npm run build

# Avvia con PM2
pm2 start dist/server.js --name "calcio-pred-api"
pm2 save
pm2 startup
```

#### 2. Frontend

```bash
cd frontend

# Configura solo API URL
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local

# Installa e builda
npm install
npm run build

# Avvia con PM2
pm2 start npm --name "calcio-pred-frontend" -- start
pm2 save
```

### Nginx Reverse Proxy

```nginx
# Backend API
server {
    listen 80;
    server_name api.tuodominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name tuodominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Sicurezza

### Password Robusta

```bash
# Genera una password sicura
openssl rand -base64 32

# Imposta in api/.env
NEXT_PUBLIC_APP_PASSWORD=<password_generata>
```

### HTTPS Obbligatorio

```bash
# Let's Encrypt con Certbot
sudo certbot --nginx -d tuodominio.com -d api.tuodominio.com
```

### Limiti e Considerazioni

L'autenticazione attuale è client-side:

✅ **Pro:**
- Semplice, nessun database per autenticazione
- Password centralizzata in un unico file
- Sufficiente per uso personale/privato

❌ **Contro:**
- Password visibile nel JavaScript del browser (anche se fetchata dal backend)
- Non adatta per utenti multipli o dati sensibili
- Nessuna protezione contro ispettori determinati

**Raccomandazione:** Va bene per deployment personale. Per produzione multi-utente, implementa JWT backend-based.

---

## Testing

### Test Locale Pre-Deploy

```bash
# 1. Backend
cd api
echo "NEXT_PUBLIC_APP_PASSWORD=TestPassword123!" >> .env
npm run build
npm run start:prod

# 2. Frontend (altra shell)
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
npm run build
npm start

# 3. Testa
# Vai su http://localhost:3000
# Inserisci "TestPassword123!"
# Verifica login/logout
# Testa mobile responsive
```

### Checklist Pre-Deploy

- [ ] `NEXT_PUBLIC_APP_PASSWORD` configurata in `api/.env` (NON default)
- [ ] `DATABASE_URL` e `REDIS_URL` configurati in `api/.env`
- [ ] `CORS_ORIGIN` in `api/.env` punta al dominio frontend corretto
- [ ] `NEXT_PUBLIC_API_URL` configurato nel frontend (Vercel o .env.local)
- [ ] Build backend e frontend completati senza errori
- [ ] Login/logout funzionanti
- [ ] Mobile responsive verificato
- [ ] HTTPS abilitato
- [ ] Nessun file `.env` committato su Git

---

## 🔥 Quick Start

```bash
# Sviluppo
# Backend
cd api && npm run dev

# Frontend (altra shell)
cd frontend && npm run dev

# Produzione
# Backend
cd api && npm run build && npm run start:prod

# Frontend
cd frontend && npm run build && npm start
```

---

## 📞 Troubleshooting

### "Password non funziona"
- Verifica che `NEXT_PUBLIC_APP_PASSWORD` sia in `api/.env`
- Controlla che il backend sia raggiungibile dal frontend
- Verifica `/api/auth/config` risponda correttamente
- Controlla console del browser per errori di fetch

### "API non risponde"
- Verifica che `NEXT_PUBLIC_API_URL` punti al backend corretto
- Controlla che `CORS_ORIGIN` in `api/.env` includa il dominio frontend
- Verifica che il backend sia pubblicamente accessibile
- Testa manualmente: `curl https://api.tuodominio.com/health`

### "Logout non funziona"
- Svuota cache del browser
- Controlla sessionStorage nelle DevTools
- Hard refresh (Ctrl+Shift+R)

---

## 🎯 Architettura File .env

```
calcio-pred/
├── api/
│   ├── .env                    ← UNICO FILE .env (password + tutte le config)
│   ├── .env.example            ← Template per setup
│   └── src/
│       └── server.ts           ← Espone /api/auth/config
│
└── frontend/
    ├── .env.local (opzionale)  ← SOLO NEXT_PUBLIC_API_URL
    ├── .gitignore              ← .env.local ignorato
    └── src/
        └── components/
            └── AuthGuard.tsx   ← Fetcha password da /api/auth/config
```

**Regola d'oro:** Cambia solo `api/.env`, il frontend si adatta automaticamente.

---

**Fatto! Sistema centralizzato pronto per il deployment. 🚀**

