/**
 * 📊 COMPARE BETS DETAIL
 * 
 * Confronta le scommesse specifiche tra PRIMA e DOPO i miglioramenti
 */

const fs = require('fs');

// Bet dal backtest PRIMA (backtest-set-nov-2025-optimized.txt)
// Periodo: Set-09 Nov 2025
const BETS_BEFORE = [
  { date: '2025-09-13', match: 'Sheffield Wednesday vs Bristol City', bet: '12', odds: 1.58, won: true },
  { date: '2025-09-14', match: 'Metz vs Angers SCO', bet: 'X2', odds: 1.61, won: true },
  { date: '2025-09-16', match: 'PSV vs Union Saint-Gilloise', bet: 'OVER 2.5', odds: 1.60, won: true },
  { date: '2025-09-18', match: 'FC København vs Bayer 04 Leverkusen', bet: '1X', odds: 1.61, won: true },
  { date: '2025-09-19', match: 'Real Betis vs Real Sociedad', bet: 'X2', odds: 1.84, won: false },
  { date: '2025-09-20', match: 'Lens vs LOSC Lille', bet: 'X2', odds: 1.60, won: false },
  { date: '2025-09-21', match: 'Paris vs Strasbourg', bet: 'X2', odds: 1.57, won: true },
  { date: '2025-09-22', match: 'Olympique Marseille vs Paris Saint Germain', bet: '1X', odds: 1.94, won: true },
  { date: '2025-09-25', match: 'VfB Stuttgart vs Celta de Vigo', bet: 'X2', odds: 1.77, won: false },
  { date: '2025-09-26', match: 'Girona vs Espanyol', bet: 'X2', odds: 1.50, won: true },
  { date: '2025-09-27', match: 'St. Pauli vs Bayer 04 Leverkusen + Leeds vs Bournemouth', bet: 'X2+12', odds: 1.85, won: false },
  { date: '2025-09-28', match: 'Konyaspor vs İstanbul Başakşehir', bet: 'X2', odds: 1.65, won: false },
  { date: '2025-09-30', match: 'Palermo vs Venezia', bet: 'X2', odds: 1.60, won: true },
  { date: '2025-10-01', match: 'Sampdoria vs Catanzaro', bet: 'X2', odds: 1.62, won: true },
  { date: '2025-10-02', match: 'Basel vs VfB Stuttgart', bet: '1X', odds: 1.82, won: true },
  { date: '2025-10-03', match: 'Hellas Verona vs Sassuolo', bet: 'X2', odds: 1.57, won: true },
  { date: '2025-10-04', match: 'Nacional vs Moreirense', bet: 'X2', odds: 1.60, won: false },
  { date: '2025-10-05', match: 'Real Sociedad vs Rayo Vallecano', bet: 'X2', odds: 1.70, won: true },
  { date: '2025-10-18', match: 'Spezia vs Cesena', bet: 'X2', odds: 1.61, won: true },
  { date: '2025-10-19', match: 'SC Freiburg vs Eintracht Frankfurt', bet: 'X2', odds: 1.52, won: true },
  { date: '2025-10-20', match: 'Eyüpspor vs Kasımpaşa', bet: 'X2', odds: 1.52, won: false },
  { date: '2025-10-21', match: 'Hull City vs Leicester City', bet: '1X', odds: 1.70, won: true },
  { date: '2025-10-22', match: 'Rizespor vs İstanbul Başakşehir', bet: 'X2', odds: 1.55, won: true },
  { date: '2025-10-23', match: 'Maccabi Tel Aviv vs FC Midtjylland + Brann vs Rangers', bet: 'X2+1X', odds: 1.78, won: true },
  { date: '2025-10-24', match: 'Real Sociedad vs Sevilla', bet: '12', odds: 1.66, won: true },
  { date: '2025-10-25', match: 'FC Volendam vs Heracles + Millwall vs Leicester', bet: '1X+12', odds: 1.74, won: true },
  { date: '2025-10-26', match: 'Everton vs Tottenham Hotspur', bet: 'X2', odds: 1.63, won: true },
  { date: '2025-10-29', match: 'Nice vs LOSC Lille', bet: '1X', odds: 1.82, won: true },
  { date: '2025-10-30', match: 'Cagliari vs Sassuolo', bet: 'X2', odds: 1.49, won: true },
  { date: '2025-11-01', match: 'Casa Pia vs Estrela Amadora', bet: 'X2', odds: 1.63, won: true },
  { date: '2025-11-02', match: 'FC Utrecht vs NEC Nijmegen', bet: 'X2', odds: 1.65, won: false },
  { date: '2025-11-03', match: 'Alanyaspor vs Gaziantep F.K.', bet: 'X2', odds: 1.89, won: true },
  { date: '2025-11-04', match: 'Paris Saint Germain vs FC Bayern München', bet: 'X2', odds: 1.58, won: true },
  { date: '2025-11-05', match: 'Olympique Marseille vs Atalanta', bet: 'X2', odds: 1.62, won: true },
  { date: '2025-11-06', match: 'Dinamo Zagreb vs Celta de Vigo', bet: 'X2', odds: 1.61, won: true },
  { date: '2025-11-07', match: 'Watford vs Bristol City', bet: 'X2', odds: 1.72, won: true },
  { date: '2025-11-08', match: 'Südtirol vs Carrarese', bet: 'X2', odds: 1.60, won: true },
  { date: '2025-11-09', match: 'Fatih Karagümrük vs Konyaspor', bet: 'X2', odds: 1.45, won: false },
];

// Bet dal backtest DOPO (backtest-result-2025-09-01_to_2025-12-10)
// Periodo: Set-10 Dic 2025
const BETS_AFTER = [
  { date: '2025-09-13', match: 'Calcio Padova vs Frosinone', bet: 'X2', odds: 1.51, won: true },
  { date: '2025-09-14', match: 'Telstar vs Fortuna Sittard', bet: 'X2', odds: 1.68, won: false },
  { date: '2025-09-15', match: 'Rayo Vallecano vs Atlético Madrid', bet: '1', odds: 2.23, won: true },
  { date: '2025-09-19', match: 'Lens vs LOSC Lille', bet: '2', odds: 2.36, won: true },
  { date: '2025-09-20', match: 'Leicester City vs Coventry City', bet: 'X2', odds: 1.52, won: true },
  { date: '2025-09-21', match: 'AZ vs Feyenoord', bet: 'X2', odds: 1.55, won: true },
  { date: '2025-09-25', match: 'Osasuna vs Elche', bet: 'X2', odds: 1.86, won: true },
  { date: '2025-09-27', match: 'Getxo vs Betis CF', bet: 'X2', odds: 1.55, won: true },
  { date: '2025-09-28', match: 'Lecce vs Parma', bet: '2', odds: 2.54, won: true },
  { date: '2025-10-03', match: 'NAC Breda vs FC Groningen', bet: 'X2', odds: 1.46, won: true },
  { date: '2025-10-04', match: 'Atalanta vs Como', bet: 'X2', odds: 1.67, won: true },
  { date: '2025-10-05', match: 'Udinese vs Lecce', bet: '2', odds: 2.38, won: true },
  { date: '2025-10-18', match: 'Parma vs Empoli', bet: '2', odds: 2.35, won: true },
  { date: '2025-10-19', match: 'Southampton vs Leicester', bet: '2', odds: 2.27, won: true },
  { date: '2025-10-25', match: 'Sampdoria vs Frosinone', bet: 'X2', odds: 1.56, won: true },
  { date: '2025-10-28', match: 'Frosinone vs Virtus Entella', bet: '1', odds: 2.19, won: true },
  { date: '2025-10-29', match: 'Navalcarnero vs Merida', bet: '1X', odds: 1.56, won: true },
  { date: '2025-10-30', match: 'Atlético Baleares vs Gimnàstic Tarragona', bet: '1X', odds: 1.55, won: true },
  { date: '2025-11-01', match: 'Carrarese vs Cittadella', bet: '2', odds: 2.72, won: true },
  { date: '2025-11-02', match: 'Arouca vs Moreirense', bet: 'X2', odds: 1.48, won: true },
  { date: '2025-11-03', match: 'Southampton vs Everton', bet: '2', odds: 2.47, won: false },
  { date: '2025-11-08', match: 'Sevilla vs Osasuna', bet: 'X2', odds: 1.70, won: false },
  { date: '2025-11-21', match: 'Espanyol vs Valencia', bet: '2', odds: 2.68, won: false },
  { date: '2025-11-22', match: 'Kayserispor vs Gaziantep F.K.', bet: 'X2', odds: 1.52, won: true },
  { date: '2025-11-24', match: 'İstanbul Başakşehir vs Trabzonspor', bet: 'X2', odds: 1.54, won: true },
  { date: '2025-11-29', match: 'Casa Pia vs Alverca', bet: 'X2', odds: 1.50, won: true },
  { date: '2025-11-30', match: 'Crystal Palace vs Manchester United', bet: 'X2', odds: 1.86, won: true },
  { date: '2025-12-02', match: 'Racing Ferrol vs Huesca', bet: 'X2', odds: 1.48, won: true },
  { date: '2025-12-03', match: 'Eldense vs Almería', bet: 'X2', odds: 1.70, won: true },
  { date: '2025-12-04', match: 'Tenerife vs Granada', bet: 'X2', odds: 1.56, won: true },
  { date: '2025-12-05', match: 'Eldense vs Mirandés', bet: '1X', odds: 1.68, won: false },
  { date: '2025-12-06', match: 'Cosenza vs Mantova', bet: 'X2', odds: 1.65, won: true },
  { date: '2025-12-07', match: 'Auxerre vs Monaco', bet: '1X', odds: 1.67, won: false },
  { date: '2025-12-08', match: 'Granada vs Real Oviedo', bet: 'X2', odds: 1.71, won: true },
];

console.log('\n' + '='.repeat(120));
console.log('📊 CONFRONTO DETTAGLIATO SCOMMESSE: PRIMA vs DOPO');
console.log('='.repeat(120));

// Periodo di sovrapposizione: Set 13 - Nov 9
const overlapStart = '2025-09-13';
const overlapEnd = '2025-11-09';

const beforeOverlap = BETS_BEFORE.filter(b => b.date >= overlapStart && b.date <= overlapEnd);
const afterOverlap = BETS_AFTER.filter(b => b.date >= overlapStart && b.date <= overlapEnd);

console.log(`\n📅 Periodo di sovrapposizione: ${overlapStart} → ${overlapEnd}`);
console.log(`   PRIMA: ${beforeOverlap.length} scommesse`);
console.log(`   DOPO:  ${afterOverlap.length} scommesse`);

// Trova match identici (stessa data)
console.log('\n' + '─'.repeat(120));
console.log('🔍 ANALISI PER DATA - CONFRONTO DIRETTO');
console.log('─'.repeat(120));

const allDates = [...new Set([...beforeOverlap.map(b => b.date), ...afterOverlap.map(b => b.date)])].sort();

let sameBets = 0;
let differentBets = 0;
let onlyBefore = 0;
let onlyAfter = 0;

allDates.forEach(date => {
  const before = beforeOverlap.find(b => b.date === date);
  const after = afterOverlap.find(b => b.date === date);
  
  if (before && after) {
    if (before.bet === after.bet && before.match === after.match) {
      sameBets++;
      const icon = before.won ? '✅' : '❌';
      console.log(`${date}: ${icon} IDENTICA → ${before.bet} su ${before.match.substring(0, 40)}`);
    } else {
      differentBets++;
      const beforeIcon = before.won ? '✅' : '❌';
      const afterIcon = after.won ? '✅' : '❌';
      console.log(`${date}: 📊 DIVERSA`);
      console.log(`         PRIMA ${beforeIcon}: ${before.bet} su ${before.match.substring(0, 40)} @${before.odds}`);
      console.log(`         DOPO  ${afterIcon}: ${after.bet} su ${after.match.substring(0, 40)} @${after.odds}`);
    }
  } else if (before && !after) {
    onlyBefore++;
    const icon = before.won ? '✅' : '❌';
    console.log(`${date}: ${icon} SOLO PRIMA → ${before.bet} su ${before.match.substring(0, 40)}`);
  } else if (!before && after) {
    onlyAfter++;
    const icon = after.won ? '✅' : '❌';
    console.log(`${date}: ${icon} SOLO DOPO → ${after.bet} su ${after.match.substring(0, 40)}`);
  }
});

console.log('\n' + '─'.repeat(120));
console.log('📈 STATISTICHE CONFRONTO');
console.log('─'.repeat(120));

console.log(`\n   Scommesse identiche: ${sameBets}`);
console.log(`   Scommesse diverse:   ${differentBets}`);
console.log(`   Solo PRIMA:          ${onlyBefore}`);
console.log(`   Solo DOPO:           ${onlyAfter}`);

// Analisi perdite
console.log('\n' + '─'.repeat(120));
console.log('🔴 ANALISI PERDITE');
console.log('─'.repeat(120));

const lossesBefore = beforeOverlap.filter(b => !b.won);
const lossesAfter = afterOverlap.filter(b => !b.won);

console.log('\n   PERDITE PRIMA (9):');
lossesBefore.forEach(b => {
  console.log(`      ${b.date}: ${b.bet} su ${b.match} @${b.odds}`);
});

console.log('\n   PERDITE DOPO (periodo overlapping):');
lossesAfter.forEach(b => {
  console.log(`      ${b.date}: ${b.bet} su ${b.match} @${b.odds}`);
});

// Confronto finale
console.log('\n' + '─'.repeat(120));
console.log('💡 CONCLUSIONE');
console.log('─'.repeat(120));

const beforeWins = beforeOverlap.filter(b => b.won).length;
const afterWins = afterOverlap.filter(b => b.won).length;

console.log(`\n   PRIMA: ${beforeWins}/${beforeOverlap.length} (${(beforeWins/beforeOverlap.length*100).toFixed(1)}% win rate)`);
console.log(`   DOPO:  ${afterWins}/${afterOverlap.length} (${(afterWins/afterOverlap.length*100).toFixed(1)}% win rate)`);

console.log('\n   ⚠️  I due backtest usano DIVERSE selezioni di partite!');
console.log('   → Il backtest PRIMA aveva filtri meno restrittivi');
console.log('   → Il backtest DOPO filtra con P(opposte) più stringenti');
console.log('   → Questo causa meno raccomandazioni MA più accurate');

console.log('\n' + '='.repeat(120));
