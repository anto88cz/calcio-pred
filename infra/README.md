# Docker Setup - Calcio-Pred

## 🐳 Servizi Docker

Il progetto include 4 servizi containerizzati:

1. **PostgreSQL 15** - Database principale
2. **Redis 7** - Cache per performance ottimizzate
3. **API Backend** - Node.js + Express + TypeScript + Prisma
4. **Frontend** - Next.js + TypeScript + Tailwind

## 🚀 Quick Start

### 1. Configurazione

```powershell
# Copia il file di esempio
cp infra\.env.example infra\.env

# Modifica infra\.env con la tua API key
# APIFOOTBALL_KEY=your_api_key_here
```

### 2. Avvio servizi

```powershell
# Dalla root del progetto
npm run docker:up

# Oppure dalla cartella infra
cd infra
docker-compose up -d
```

### 3. Verifica stato

```powershell
# Vedi lo stato dei container
docker-compose -f infra/docker-compose.yml ps

# Vedi i log
npm run docker:logs

# Log di un servizio specifico
docker-compose -f infra/docker-compose.yml logs -f api
```

### 4. Primo avvio - Inizializzazione DB

Al primo avvio, il container API esegue automaticamente le migrazioni Prisma:

```
🔧 Running database migrations...
✅ Migrations applied successfully
🚀 Starting API server...
```

## 📊 Accesso ai servizi

Una volta avviati, i servizi sono disponibili su:

- **Frontend**: http://localhost:3000
- **API Backend**: http://localhost:3001
- **PostgreSQL**: localhost:5432 (user: calciopred, password: calciopred123)
- **Redis**: localhost:6379

## 🔧 Comandi Utili

### Gestione container

```powershell
# Avvia tutti i servizi
npm run docker:up

# Ferma tutti i servizi (preserva i volumi)
npm run docker:down

# Ferma e rimuovi volumi (ATTENZIONE: cancella i dati!)
docker-compose -f infra/docker-compose.yml down -v

# Riavvia un singolo servizio
docker-compose -f infra/docker-compose.yml restart api

# Rebuild di un servizio
docker-compose -f infra/docker-compose.yml build --no-cache api
docker-compose -f infra/docker-compose.yml up -d api
```

### Log e debugging

```powershell
# Tutti i log in real-time
npm run docker:logs

# Log degli ultimi 100 messaggi
docker-compose -f infra/docker-compose.yml logs --tail=100

# Solo errori dell'API
docker-compose -f infra/docker-compose.yml logs api | Select-String "error"

# Entra in un container
docker exec -it calciopred-api sh
```

### Database management

```powershell
# Accedi a PostgreSQL
docker exec -it calciopred-postgres psql -U calciopred -d calciopred

# Backup database
docker exec calciopred-postgres pg_dump -U calciopred calciopred > backup.sql

# Restore database
cat backup.sql | docker exec -i calciopred-postgres psql -U calciopred calciopred

# Prisma Studio (GUI per il database)
cd api
npm run prisma:studio
```

### Redis management

```powershell
# Accedi a Redis CLI
docker exec -it calciopred-redis redis-cli

# Vedi tutte le chiavi
docker exec calciopred-redis redis-cli KEYS "*"

# Pulisci la cache
docker exec calciopred-redis redis-cli FLUSHALL

# Info memoria Redis
docker exec calciopred-redis redis-cli INFO memory
```

## 🔍 Health Checks

Tutti i servizi hanno health checks configurati:

```powershell
# Verifica salute dei servizi
docker-compose -f infra/docker-compose.yml ps

# Output esempio:
# NAME                    STATUS              PORTS
# calciopred-api          Up (healthy)        0.0.0.0:3001->3001/tcp
# calciopred-frontend     Up (healthy)        0.0.0.0:3000->3000/tcp
# calciopred-postgres     Up (healthy)        0.0.0.0:5432->5432/tcp
# calciopred-redis        Up (healthy)        0.0.0.0:6379->6379/tcp
```

## 📦 Volumi Persistenti

I dati sono salvati in volumi Docker:

- `postgres_data` - Database PostgreSQL
- `redis_data` - Persistenza Redis (AOF)

```powershell
# Lista volumi
docker volume ls | Select-String "calciopred"

# Ispeziona un volume
docker volume inspect infra_postgres_data
```

## 🐛 Troubleshooting

### Port già in uso

Se hai già servizi in ascolto sulle porte 3000, 3001, 5432, o 6379:

```powershell
# Windows - vedi chi usa una porta
netstat -ano | findstr :3001

# Cambia le porte nel docker-compose.yml
# Esempio per API: "3002:3001" invece di "3001:3001"
```

### Database non si connette

```powershell
# Verifica che postgres sia healthy
docker-compose -f infra/docker-compose.yml ps postgres

# Vedi i log di postgres
docker-compose -f infra/docker-compose.yml logs postgres

# Reset completo del database
docker-compose -f infra/docker-compose.yml down -v
docker volume rm infra_postgres_data
npm run docker:up
```

### API non parte

```powershell
# Vedi i log dettagliati
docker-compose -f infra/docker-compose.yml logs api

# Rebuild del container
docker-compose -f infra/docker-compose.yml build --no-cache api
docker-compose -f infra/docker-compose.yml up -d api
```

## 🔄 Aggiornamenti

Dopo modifiche al codice:

```powershell
# Rebuild e restart
docker-compose -f infra/docker-compose.yml up -d --build

# Solo API
docker-compose -f infra/docker-compose.yml up -d --build api

# Solo Frontend
docker-compose -f infra/docker-compose.yml up -d --build frontend
```

## 🌐 Ambiente di Produzione

Per il deploy in produzione:

1. Cambia le password in `docker-compose.yml`
2. Usa secrets Docker per credenziali sensibili
3. Configura reverse proxy (Nginx/Traefik)
4. Abilita SSL/TLS
5. Configura backup automatici del database
6. Monitora i log con un sistema centralizzato (ELK, Loki)

## 📝 Note

- I container usano utenti non-root per sicurezza
- Redis configurato con LRU eviction (max 256MB)
- PostgreSQL usa volumi persistenti con pgdata
- Health checks con retry logic per stabilità
- Network isolato per comunicazione tra servizi
