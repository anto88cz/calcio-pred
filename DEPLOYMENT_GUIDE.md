# 🚀 Guida al Deployment - Calcio-Pred

## 📋 Indice
1. [Pre-requisiti](#pre-requisiti)
2. [Configurazione Password](#configurazione-password)
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

---

## Configurazione Password

### Sviluppo

Il file `.env.local` contiene la configurazione locale:

```bash
NEXT_PUBLIC_APP_PASSWORD=calcio2025
```

**⚠️ NON committare mai il file `.env.local` su Git!**

### Produzione

**Cambia SEMPRE la password di default prima del deployment:**

1. Scegli una password sicura (almeno 12 caratteri, mix di lettere, numeri, simboli)
2. Configura la variabile d'ambiente nella piattaforma di hosting

---

## Deployment Vercel

### Step 1: Preparazione

```bash
cd frontend
npm install
npm run build  # Verifica che il build sia ok
```

### Step 2: Deploy

```bash
# Installa Vercel CLI se non l'hai già
npm install -g vercel

# Login
vercel login

# Deploy
vercel
```

### Step 3: Configurazione Environment Variables

Vai su Vercel Dashboard → Progetto → Settings → Environment Variables

Aggiungi:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://tuobackend.com` | Production |
| `NEXT_PUBLIC_APP_PASSWORD` | `TuaPasswordSicura123!` | Production |
| `NEXT_PUBLIC_APP_NAME` | `Calcio-Pred` | Production |
| `NEXT_PUBLIC_APP_VERSION` | `1.0.0` | Production |

### Step 4: Redeploy

Dopo aver configurato le variabili, triggera un nuovo deployment:

```bash
vercel --prod
```

---

## Deployment Manuale

### Su VPS/Server Linux

```bash
# 1. Clona il repository
git clone <tuo-repo>
cd calcio-pred/frontend

# 2. Installa dipendenze
npm install

# 3. Configura environment variables
nano .env.local  # Imposta NEXT_PUBLIC_APP_PASSWORD

# 4. Build production
npm run build

# 5. Avvia con PM2 (consigliato)
npm install -g pm2
pm2 start npm --name "calcio-pred" -- start
pm2 save
pm2 startup
```

### Nginx Reverse Proxy (opzionale)

```nginx
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

### ⚠️ IMPORTANTE: Limitazioni Attuali

L'autenticazione attuale è **client-side** con `sessionStorage`:

✅ **Pro:**
- Semplice da implementare
- Sufficiente per uso personale
- Nessun database richiesto

❌ **Contro:**
- Password visibile nel codice JavaScript del browser
- Nessuna protezione contro utenti determinati
- Non adatta per dati sensibili

### 🔒 Raccomandazioni per Produzione

#### 1. Password Sicura
```bash
# Genera una password robusta
openssl rand -base64 32
```

#### 2. Rate Limiting (Opzionale ma consigliato)

Aggiungi al backend API un middleware di rate limiting:

```javascript
// backend/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 5, // 5 tentativi
  message: 'Troppi tentativi di login, riprova tra 15 minuti'
});

module.exports = { loginLimiter };
```

#### 3. HTTPS Obbligatorio

- ✅ Vercel: HTTPS automatico
- 🔧 Server manuale: Usa Let's Encrypt

```bash
# Certbot per SSL gratis
sudo certbot --nginx -d tuodominio.com
```

#### 4. Migrazione a Backend Auth (Futuro)

Per una sicurezza enterprise-grade, considera:

- JWT tokens con scadenza
- Backend authentication endpoint
- Session management su Redis
- Hashing bcrypt per password

---

## Testing

### Test Locale Pre-Deploy

```bash
# 1. Imposta password di test
echo "NEXT_PUBLIC_APP_PASSWORD=TestPassword123!" > .env.local

# 2. Build production locale
npm run build
npm start

# 3. Testa il login
# Vai su http://localhost:3000
# Prova password corretta e sbagliata
# Verifica logout
# Controlla che sessionStorage funzioni

# 4. Testa mobile
# Apri Chrome DevTools → Toggle Device Toolbar
# Testa su iPhone, Android, Tablet
```

### Checklist Pre-Deploy

- [ ] Password di produzione configurata (diversa da default)
- [ ] `NEXT_PUBLIC_API_URL` punta al backend corretto
- [ ] Build completato senza errori
- [ ] Login/logout funzionanti
- [ ] Mobile responsive verificato
- [ ] Backend API accessibile pubblicamente
- [ ] Redis funzionante e accessibile al backend
- [ ] HTTPS abilitato

---

## 🔥 Quick Start

```bash
# Sviluppo
cd frontend
npm install
npm run dev

# Produzione (dopo aver configurato .env.local)
npm run build
npm start

# Deploy Vercel
vercel --prod
```

---

## 📞 Troubleshooting

### "Password non funziona"
- Controlla che `NEXT_PUBLIC_APP_PASSWORD` sia configurata
- Verifica che il deployment abbia ricaricato le env vars
- Controlla la console del browser per errori

### "API non risponde"
- Verifica che `NEXT_PUBLIC_API_URL` punti al backend corretto
- Controlla che il backend sia pubblicamente accessibile
- Controlla CORS sul backend

### "Logout non funziona"
- Svuota cache del browser
- Controlla sessionStorage nelle DevTools
- Hard refresh (Ctrl+Shift+R)

---

## 🎯 Next Steps (Miglioramenti Futuri)

1. **Backend Auth**: JWT + bcrypt + database
2. **2FA**: Autenticazione a due fattori
3. **User Roles**: Admin/User/Guest
4. **Audit Log**: Tracking accessi
5. **OAuth**: Login con Google/GitHub

---

**Fatto! L'app è protetta e pronta per il deployment. 🚀**
