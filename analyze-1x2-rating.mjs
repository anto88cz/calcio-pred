#!/usr/bin/env node

/**
 * ANALISI APPROFONDITA 1X2 E RATING
 * Analizza il backtest per identificare pattern e miglioramenti
 */

import fs from 'fs';

const report = JSON.parse(fs.readFileSync('backtest-report-2025-10-09_to_2025-11-09.json', 'utf8'));

console.log('\n📊 ANALISI APPROFONDITA 1X2 (RISULTATI)\n');
console.log('='*80);

// Filtra solo 1X2
const result1X2 = report.allRecommendations.filter(r => r.type === 'result');

console.log(`\n📈 DATI GENERALI 1X2:`);
console.log(`   Totale: ${result1X2.length}`);
console.log(`   Wins: ${result1X2.filter(r => r.outcome === 'WIN').length}`);
console.log(`   Losses: ${result1X2.filter(r => r.outcome === 'LOSS').length}`);
console.log(`   Win Rate: ${(result1X2.filter(r => r.outcome === 'WIN').length / result1X2.length * 100).toFixed(2)}%`);

// Analisi per rating
console.log(`\n⭐ PERFORMANCE 1X2 PER RATING:`);
for (let rating = 1; rating <= 5; rating++) {
  const recs = result1X2.filter(r => r.valueRating === rating);
  if (recs.length > 0) {
    const wins = recs.filter(r => r.outcome === 'WIN').length;
    const winRate = (wins / recs.length * 100).toFixed(2);
    const avgEV = (recs.reduce((sum, r) => sum + r.expectedValue, 0) / recs.length).toFixed(2);
    console.log(`   ${rating}⭐: ${wins}W/${recs.length - wins}L (${winRate}%) - Avg EV: ${avgEV}%`);
  }
}

// Analisi per tipo di risultato (1, X, 2)
console.log(`\n🎯 PERFORMANCE PER TIPO DI RISULTATO:`);
const home = result1X2.filter(r => r.recommendation.includes('1 -') || r.recommendation.includes('Vittoria Casa'));
const draw = result1X2.filter(r => r.recommendation.includes('X -') || r.recommendation.includes('Pareggio'));
const away = result1X2.filter(r => r.recommendation.includes('2 -') || r.recommendation.includes('Vittoria Trasferta'));

console.log(`   1 (Casa): ${home.filter(r => r.outcome === 'WIN').length}W/${home.filter(r => r.outcome === 'LOSS').length}L (${(home.filter(r => r.outcome === 'WIN').length / home.length * 100).toFixed(2)}%)`);
console.log(`   X (Pareggio): ${draw.filter(r => r.outcome === 'WIN').length}W/${draw.filter(r => r.outcome === 'LOSS').length}L (${(draw.filter(r => r.outcome === 'WIN').length / draw.length * 100).toFixed(2)}%)`);
console.log(`   2 (Trasferta): ${away.filter(r => r.outcome === 'WIN').length}W/${away.filter(r => r.outcome === 'LOSS').length}L (${(away.filter(r => r.outcome === 'WIN').length / away.length * 100).toFixed(2)}%)`);

// Analisi per EV
console.log(`\n📊 PERFORMANCE PER EXPECTED VALUE (1X2):`);
const highEV = result1X2.filter(r => r.expectedValue > 20);
const mediumEV = result1X2.filter(r => r.expectedValue > 10 && r.expectedValue <= 20);
const lowEV = result1X2.filter(r => r.expectedValue > 5 && r.expectedValue <= 10);
const neutralEV = result1X2.filter(r => r.expectedValue >= -5 && r.expectedValue <= 5);

console.log(`   EV > 20%: ${highEV.filter(r => r.outcome === 'WIN').length}W/${highEV.filter(r => r.outcome === 'LOSS').length}L (${highEV.length > 0 ? (highEV.filter(r => r.outcome === 'WIN').length / highEV.length * 100).toFixed(2) : 0}%)`);
console.log(`   EV 10-20%: ${mediumEV.filter(r => r.outcome === 'WIN').length}W/${mediumEV.filter(r => r.outcome === 'LOSS').length}L (${mediumEV.length > 0 ? (mediumEV.filter(r => r.outcome === 'WIN').length / mediumEV.length * 100).toFixed(2) : 0}%)`);
console.log(`   EV 5-10%: ${lowEV.filter(r => r.outcome === 'WIN').length}W/${lowEV.filter(r => r.outcome === 'LOSS').length}L (${lowEV.length > 0 ? (lowEV.filter(r => r.outcome === 'WIN').length / lowEV.length * 100).toFixed(2) : 0}%)`);
console.log(`   EV ±5%: ${neutralEV.filter(r => r.outcome === 'WIN').length}W/${neutralEV.filter(r => r.outcome === 'LOSS').length}L (${neutralEV.length > 0 ? (neutralEV.filter(r => r.outcome === 'WIN').length / neutralEV.length * 100).toFixed(2) : 0}%)`);

// Analisi per campionato
console.log(`\n🏆 PERFORMANCE 1X2 PER CAMPIONATO:`);
const competitions = [...new Set(result1X2.map(r => r.competition))];
competitions.forEach(comp => {
  const recs = result1X2.filter(r => r.competition === comp);
  const wins = recs.filter(r => r.outcome === 'WIN').length;
  console.log(`   ${comp}: ${wins}W/${recs.length - wins}L (${(wins / recs.length * 100).toFixed(2)}%)`);
});

// Analisi per quote
console.log(`\n💰 PERFORMANCE PER RANGE DI QUOTE (1X2):`);
const lowOdds = result1X2.filter(r => r.odds < 2.0);
const mediumOdds = result1X2.filter(r => r.odds >= 2.0 && r.odds < 3.5);
const highOdds = result1X2.filter(r => r.odds >= 3.5);

console.log(`   Quote < 2.0 (Favoriti): ${lowOdds.filter(r => r.outcome === 'WIN').length}W/${lowOdds.filter(r => r.outcome === 'LOSS').length}L (${lowOdds.length > 0 ? (lowOdds.filter(r => r.outcome === 'WIN').length / lowOdds.length * 100).toFixed(2) : 0}%)`);
console.log(`   Quote 2.0-3.5 (Equilibrate): ${mediumOdds.filter(r => r.outcome === 'WIN').length}W/${mediumOdds.filter(r => r.outcome === 'LOSS').length}L (${mediumOdds.length > 0 ? (mediumOdds.filter(r => r.outcome === 'WIN').length / mediumOdds.length * 100).toFixed(2) : 0}%)`);
console.log(`   Quote > 3.5 (Underdog): ${highOdds.filter(r => r.outcome === 'WIN').length}W/${highOdds.filter(r => r.outcome === 'LOSS').length}L (${highOdds.length > 0 ? (highOdds.filter(r => r.outcome === 'WIN').length / highOdds.length * 100).toFixed(2) : 0}%)`);

// ANALISI GLOBALE RATING
console.log(`\n\n📊 ANALISI GLOBALE RATING (TUTTI I TIPI)\n`);
console.log('='*80);

for (let rating = 1; rating <= 5; rating++) {
  const recs = report.allRecommendations.filter(r => r.valueRating === rating);
  if (recs.length > 0) {
    const wins = recs.filter(r => r.outcome === 'WIN').length;
    const winRate = (wins / recs.length * 100).toFixed(2);
    const avgEV = (recs.reduce((sum, r) => sum + r.expectedValue, 0) / recs.length).toFixed(2);
    const avgOdds = (recs.reduce((sum, r) => sum + r.odds, 0) / recs.length).toFixed(2);
    const profit = recs.reduce((sum, r) => sum + r.profit, 0).toFixed(2);
    
    console.log(`\n⭐ ${rating} STELLE:`);
    console.log(`   Totale: ${recs.length}`);
    console.log(`   Wins: ${wins} | Losses: ${recs.length - wins}`);
    console.log(`   Win Rate: ${winRate}%`);
    console.log(`   Avg EV: ${avgEV}%`);
    console.log(`   Avg Odds: ${avgOdds}`);
    console.log(`   Profitto: ${profit > 0 ? '+' : ''}${profit} unità`);
    console.log(`   ROI: ${(profit / recs.length * 100).toFixed(2)}%`);
    
    // Breakdown per tipo
    const byType = {};
    recs.forEach(r => {
      if (!byType[r.type]) byType[r.type] = { wins: 0, total: 0 };
      byType[r.type].total++;
      if (r.outcome === 'WIN') byType[r.type].wins++;
    });
    
    console.log(`   Breakdown:`);
    Object.entries(byType).forEach(([type, stats]) => {
      console.log(`      ${type}: ${stats.wins}/${stats.total} (${(stats.wins/stats.total*100).toFixed(1)}%)`);
    });
  }
}

// RACCOMANDAZIONI
console.log(`\n\n💡 RACCOMANDAZIONI PER MIGLIORAMENTI\n`);
console.log('='*80);

console.log(`\n🎯 1X2 (Risultati):`);
console.log(`   ❌ Win rate attuale: 37.31% (troppo basso)`);
console.log(`   ✅ Target: > 45%`);
console.log(`\n   Azioni suggerite:`);
console.log(`   1. Aumentare soglia confidence da 0.30 a 0.40 (più selettivi)`);
console.log(`   2. Richiedere EV minimo 10% (attualmente 5%)`);
console.log(`   3. Favorire risultati con quote 2.0-3.5 (migliori performance)`);
console.log(`   4. Penalizzare Champions League (40% win rate generale)`);

console.log(`\n⭐ Rating System:`);
console.log(`   ❌ 4⭐ e 5⭐: 36-37.5% win rate (sotto performance)`);
console.log(`   ✅ 1⭐, 2⭐, 3⭐: 51-59% win rate (ottimi)`);
console.log(`\n   Azioni suggerite:`);
console.log(`   1. Aumentare soglia 5⭐ da 25% a 40% EV`);
console.log(`   2. Aumentare soglia 4⭐ da 15% a 25% EV`);
console.log(`   3. Oppure: eliminare 4-5⭐, massimo 3⭐`);
console.log(`   4. Aggiungere fattore "competition difficulty" al rating`);

console.log(`\n📰 Integrazione News:`);
console.log(`   Sportmonks API fornisce:`);
console.log(`   - Pre-match news (infortuni, squalifiche, formazioni)`);
console.log(`   - Lineup confirmed`);
console.log(`   - Missing players`);
console.log(`\n   Utilizzo suggerito:`);
console.log(`   1. Ridurre confidence se missing key players`);
console.log(`   2. Boost confidence se lineup favorevole`);
console.log(`   3. Penalizzare 1X2 se alta incertezza lineup`);
console.log(`   4. Boost Goal/NoGoa se notizie su attaccanti`);

console.log('\n' + '='*80 + '\n');
