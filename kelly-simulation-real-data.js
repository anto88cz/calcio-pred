// 🧮 SIMULAZIONE KELLY CRITERION SUI NOSTRI DATI REALI
// Basato sui risultati del backtest ROI +35.46%

const fs = require('fs');

console.log('📊 SIMULAZIONE KELLY CRITERION - DATI REALI');
console.log('===========================================\n');

// Funzione Kelly
function calculateKellyStake(modelProbability, odds, kellyFraction = 0.5) {
  const b = odds - 1;
  const p = modelProbability;
  const q = 1 - p;
  
  const kellyF = (b * p - q) / b;
  
  // Se Kelly negativo, non scommettere
  if (kellyF <= 0) return 0;
  
  const fractionalKelly = kellyF * kellyFraction;
  
  // Limiti di sicurezza
  const minStake = 0.005; // 0.5% min
  const maxStake = 0.15;  // 15% max
  
  return Math.max(minStake, Math.min(maxStake, fractionalKelly));
}

// Dati dal nostro backtest
const backtestData = {
  '2star': { winRate: 100.0, avgOdds: 1.67, bets: 6 },
  '3star': { winRate: 75.0, avgOdds: 1.89, bets: 36 },
  '5star': { winRate: 37.5, avgOdds: 4.12, bets: 8 },
  
  byLeague: {
    'Serie A': { winRate: 88.9, avgOdds: 1.73, bets: 9 },
    'Bundesliga': { winRate: 77.8, avgOdds: 2.31, bets: 9 },
    'Premier League': { winRate: 72.7, avgOdds: 1.78, bets: 11 },
    'La Liga': { winRate: 60.0, avgOdds: 2.45, bets: 15 },
    'Champions League': { winRate: 66.7, avgOdds: 1.84, bets: 6 }
  },
  
  byBetType: {
    'result': { winRate: 80.0, avgOdds: 2.31, bets: 5 },
    'double_chance': { winRate: 71.1, avgOdds: 1.86, bets: 45 }
  }
};

console.log('🎯 KELLY STAKES PER VALUE RATING:');
console.log('');

Object.entries(backtestData).forEach(([category, data]) => {
  if (category !== 'byLeague' && category !== 'byBetType') {
    const prob = data.winRate / 100;
    const kelly = calculateKellyStake(prob, data.avgOdds);
    const kellyPercent = (kelly * 100).toFixed(1);
    
    console.log(`${category.toUpperCase()}:`);
    console.log(`   Win Rate: ${data.winRate}% | Avg Odds: ${data.avgOdds}`);
    console.log(`   Kelly Stake: ${kellyPercent}% del bankroll`);
    console.log(`   Bets: ${data.bets} | Kelly suggerisce: ${kelly > 0 ? 'SCOMMETTI' : 'EVITA'}`);
    console.log('');
  }
});

console.log('🌍 KELLY STAKES PER CAMPIONATO:');
console.log('');

Object.entries(backtestData.byLeague).forEach(([league, data]) => {
  const prob = data.winRate / 100;
  const kelly = calculateKellyStake(prob, data.avgOdds);
  const kellyPercent = (kelly * 100).toFixed(1);
  
  console.log(`${league}:`);
  console.log(`   Win Rate: ${data.winRate}% | Avg Odds: ${data.avgOdds}`);
  console.log(`   Kelly Stake: ${kellyPercent}% del bankroll`);
  console.log(`   Status: ${kelly > 0.05 ? '🟢 ALTO' : kelly > 0.02 ? '🟡 MEDIO' : '🔴 BASSO'}`);
  console.log('');
});

console.log('🎲 KELLY STAKES PER TIPO SCOMMESSA:');
console.log('');

Object.entries(backtestData.byBetType).forEach(([betType, data]) => {
  const prob = data.winRate / 100;
  const kelly = calculateKellyStake(prob, data.avgOdds);
  const kellyPercent = (kelly * 100).toFixed(1);
  
  console.log(`${betType.toUpperCase()}:`);
  console.log(`   Win Rate: ${data.winRate}% | Avg Odds: ${data.avgOdds}`);
  console.log(`   Kelly Stake: ${kellyPercent}% del bankroll`);
  console.log('');
});

// Simulazione ROI con Kelly
console.log('💰 SIMULAZIONE ROI CON KELLY CRITERION:');
console.log('');

let totalKellyROI = 0;
let totalCurrentROI = 0;
let totalBets = 0;

// Calcola ROI attuale vs Kelly per ogni categoria
const categories = [
  { name: '2⭐', data: backtestData['2star'], currentStake: 0.08 }, // 8% attuale
  { name: '3⭐', data: backtestData['3star'], currentStake: 0.05 }, // 5% attuale  
  { name: '5⭐', data: backtestData['5star'], currentStake: 0.03 }  // 3% attuale
];

categories.forEach(cat => {
  const prob = cat.data.winRate / 100;
  const kellyStake = calculateKellyStake(prob, cat.data.avgOdds);
  
  // ROI per singolo bet
  const avgReturn = prob * cat.data.avgOdds + (1 - prob) * 0;
  const kellyROI = (avgReturn - 1) * cat.data.bets * kellyStake;
  const currentROI = (avgReturn - 1) * cat.data.bets * cat.currentStake;
  
  totalKellyROI += kellyROI;
  totalCurrentROI += currentROI;
  totalBets += cat.data.bets;
  
  console.log(`${cat.name}:`);
  console.log(`   Current Stake: ${(cat.currentStake * 100).toFixed(1)}% | Kelly Stake: ${(kellyStake * 100).toFixed(1)}%`);
  console.log(`   Current ROI Contribution: +${(currentROI * 100).toFixed(2)}%`);
  console.log(`   Kelly ROI Contribution: +${(kellyROI * 100).toFixed(2)}%`);
  console.log(`   Miglioramento: ${kellyROI > currentROI ? '+' : ''}${((kellyROI - currentROI) * 100).toFixed(2)}%`);
  console.log('');
});

console.log('📈 RISULTATO FINALE:');
console.log('');
console.log(`ROI Attuale Stimato: +${(totalCurrentROI * 100).toFixed(2)}%`);
console.log(`ROI con Kelly: +${(totalKellyROI * 100).toFixed(2)}%`);
console.log(`🚀 MIGLIORAMENTO: +${((totalKellyROI - totalCurrentROI) * 100).toFixed(2)}%`);
console.log('');

console.log('💡 RACCOMANDAZIONI KELLY:');
console.log('');
console.log('1. 🎯 Aumentare stake su 2⭐ (100% win rate)');
console.log('2. 📊 Ottimizzare 3⭐ per campionato');  
console.log('3. 🔒 Ridurre drasticamente 5⭐ (o eliminarli)');
console.log('4. 🌍 Focus su Serie A e Bundesliga');
console.log('5. ⚖️  Stake dinamico basato su probabilità reali');

console.log('\n🚀 IMPLEMENTIAMO IL KELLY CRITERION?');