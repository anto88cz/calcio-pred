#!/bin/bash

echo "🧪 Testing ML Prediction with xG..."
echo ""

curl -s -X POST http://localhost:3001/api/ml-prediction \
  -H "Content-Type: application/json" \
  -d '{
    "fixtureId": 19424986,
    "homeTeamId": 625,
    "awayTeamId": 613,
    "seasonId": 25533,
    "leagueId": 384
  }' | python3 -m json.tool | grep -A 5 "xGData"

echo ""
echo "✅ Done"
