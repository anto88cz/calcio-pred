const fs = require('fs');
const output = fs.readFileSync('backtest-full-output.txt', 'utf8');
const sections = output.split(/(?=📅\s+Elaborazione\s+\d{4}-\d{2}-\d{2})/);
console.log('Total sections:', sections.length);

// Prova sezione con raccomandazione
const sept13 = sections.find(s => s.includes('2025-09-13'));
if (sept13) {
  console.log('\n=== Section 2025-09-13 ===');
  console.log(sept13.substring(0, 800));
  
  const recMatch = sept13.match(/\s+[✓✗]\s+([^:]+):\s+([^\s@]+)\s+@([\d.]+)/);
  console.log('\nMatch result:', recMatch ? 'FOUND' : 'NOT FOUND');
  if (recMatch) console.log('Teams:', recMatch[1], 'Bet:', recMatch[2], 'Odds:', recMatch[3]);
}
