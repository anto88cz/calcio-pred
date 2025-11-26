const fs = require('fs');
const output = fs.readFileSync('backtest-full-output.txt', 'utf8');
const sept13 = output.match(/📅 Elaborazione 2025-09-13[\s\S]{0,600}/)[0];

console.log('=== Test diversi pattern ===\n');

// Test 1: Cerca solo il ✓ con teams
const test1 = sept13.match(/✓\s+FSV Mainz/);
console.log('Test 1 (✓ FSV Mainz):', test1 ? 'FOUND' : 'NOT FOUND');

// Test 2: Cerca la riga completa
const test2 = sept13.match(/✓\s+([^:]+):/);
console.log('Test 2 (✓ TEAMS:):', test2 ? `FOUND: "${test2[1]}"` : 'NOT FOUND');

// Test 3: Cerca X2 @
const test3 = sept13.match(/X2\s+@[\d.]+/);
console.log('Test 3 (X2 @ODDS):', test3 ? 'FOUND' : 'NOT FOUND');

// Test 4: Full pattern
const test4 = sept13.match(/✓\s+(.+?):\s+(\S+)\s+@([\d.]+)/);
console.log('Test 4 (Full):', test4 ? `FOUND: teams="${test4[1]}", bet="${test4[2]}", odds="${test4[3]}"` : 'NOT FOUND');

// Mostra la riga con ✓ FSV
const lines = sept13.split('\n');
const fsvLine = lines.find(l => l.includes('✓ FSV'));
console.log('\nRiga con ✓ FSV:');
console.log(JSON.stringify(fsvLine));
console.log('Bytes:', Buffer.from(fsvLine || '').toString('hex').substring(0, 100));
