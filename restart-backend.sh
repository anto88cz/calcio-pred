#!/bin/bash

echo "🔄 Riavvio del backend per applicare le modifiche..."
echo ""
echo "NOTA: Questo script presuppone che il backend sia in esecuzione nella directory api/"
echo ""
echo "Per riavviare il backend manualmente:"
echo "  1. Vai nella directory api/: cd api"
echo "  2. Ferma il processo corrente (Ctrl+C se in foreground)"
echo "  3. Riavvia: npm run dev"
echo ""
echo "Oppure, se usi PM2:"
echo "  pm2 restart calcio-pred-api"
echo ""

read -p "Vuoi che io provi a riavviare il backend? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    cd api
    echo "🛑 Stopping backend..."
    pkill -f "tsx.*server.ts" || echo "Nessun processo da fermare"
    sleep 2
    echo "▶️  Starting backend..."
    npm run dev &
    echo ""
    echo "✅ Backend riavviato. Attendere 5 secondi per l'inizializzazione..."
    sleep 5
    echo ""
    echo "🧪 Test dell'endpoint..."
    cd ..
    node test-analysis-endpoint.js
else
    echo ""
    echo "⚠️  Ricorda di riavviare il backend manualmente per applicare le modifiche!"
fi
