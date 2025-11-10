const fs = require('fs');

// Carica i dati del backtest
const data = JSON.parse(fs.readFileSync('backtest-report-2025-10-09_to_2025-11-09.json', 'utf8'));

console.log('🔍 ANALISI PATTERN PER MIGLIORAMENTO ROI\n');

console.log('📊 PERFORMANCE PER VALUE RATING:');
data.byValueRating.forEach(rating => {
  const roi = ((rating.wins * 2.0 - rating.total) / rating.total * 100).toFixed(1);
  console.log(`   ${rating.rating}⭐: ${rating.winRate.toFixed(1)}% win rate | ROI: ${roi}%`);
});

console.log('\n🎯 PERFORMANCE PER TIPO SCOMMESSA:');
data.byBetType.forEach(type => {
  const roi = ((type.wins * 2.0 - type.total) / type.total * 100).toFixed(1);
  console.log(`   ${type.type}: ${type.winRate.toFixed(1)}% | ROI: ${roi}%`);
});

console.log('\n🏆 PERFORMANCE PER CAMPIONATO:');
data.byCompetition.forEach(comp => {
  const roi = ((comp.wins * 2.0 - comp.total) / comp.total * 100).toFixed(1);
  console.log(`   ${comp.competition}: ${comp.winRate.toFixed(1)}% | ROI: ${roi}%`);
});

console.log('\n💎 TOP WINS ANALYSIS:');
const topWins = data.topWins.slice(0,10);
topWins.forEach((win, i) => {
  console.log(`   ${i+1}. ${win.valueRating}⭐ | EV: ${win.expectedValue.toFixed(1)}% | Profit: +${win.profit}`);
});

console.log('\n🔍 PATTERN IDENTIFICATI:');

// Analizza pattern di successo
const highROI_Ratings = data.byValueRating.filter(r => {
  const roi = ((r.wins * 2.0 - r.total) / r.total * 100);
  return roi > 20;
});

const highROI_BetTypes = data.byBetType.filter(b => {
  const roi = ((b.wins * 2.0 - b.total) / b.total * 100);
  return roi > 20;
});

const highROI_Competitions = data.byCompetition.filter(c => {
  const roi = ((c.wins * 2.0 - c.total) / c.total * 100);
  return roi > 20;
});

console.log('\n⚡ SUPER PERFORMANTI (ROI > 20%):');
highROI_Ratings.forEach(r => console.log(`   - Rating ${r.rating}⭐: ${((r.wins * 2.0 - r.total) / r.total * 100).toFixed(1)}% ROI`));
highROI_BetTypes.forEach(b => console.log(`   - ${b.type}: ${((b.wins * 2.0 - b.total) / b.total * 100).toFixed(1)}% ROI`));
highROI_Competitions.forEach(c => console.log(`   - ${c.competition}: ${((c.wins * 2.0 - c.total) / c.total * 100).toFixed(1)}% ROI`));

console.log('\n📈 RACCOMANDAZIONI MIGLIORAMENTO:');
console.log('1. 🎯 Focus su 2⭐ ratings (74% win rate)');
console.log('2. 🚀 Potenzia Doppia Chance (63% win rate)');
console.log('3. 🏆 Priorità Bundesliga (64% win rate)');
console.log('4. ⚠️  Rivedi 4⭐ ratings (26% win rate - possibile sovraconfidenza)');
console.log('5. 🔧 Ottimizza Goal/NoGoal (53% win rate - margine miglioramento)');
