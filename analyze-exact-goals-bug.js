// Analisi matematica delle 4 partite di oggi
console.log('\n🔍 ANALYZING EXACT GOALS CALCULATION\n');
console.log('='.repeat(120));

const matches = [
  { name: 'Pisa vs Cremonese', lambdaH: 0.98, lambdaA: 0.29 },
  { name: 'Elche vs Real Sociedad', lambdaH: 1.97, lambdaA: 0.73 },
  { name: 'Paris FC vs Rennes', lambdaH: 2.00, lambdaA: 1.56 },
  { name: 'Werder vs Wolfsburg', lambdaH: 1.00, lambdaA: 1.43 }
];

function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProb(lambda, k) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateScoreProbabilities(lambdaH, lambdaA) {
  const scores = [];
  
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const probH = poissonProb(lambdaH, h);
      const probA = poissonProb(lambdaA, a);
      const prob = probH * probA;
      scores.push({ score: `${h}-${a}`, prob, h, a });
    }
  }
  
  scores.sort((a, b) => b.prob - a.prob);
  return scores;
}

for (const match of matches) {
  console.log(`\n\n📊 ${match.name}`);
  console.log(`   Expected Goals: Home=${match.lambdaH.toFixed(2)}, Away=${match.lambdaA.toFixed(2)}`);
  console.log('-'.repeat(120));
  
  const scores = calculateScoreProbabilities(match.lambdaH, match.lambdaA);
  
  console.log('\n   🎯 TOP 5 MOST LIKELY SCORES (CORRECT POISSON):');
  scores.slice(0, 5).forEach((s, i) => {
    console.log(`      ${i + 1}. ${s.score}: ${(s.prob * 100).toFixed(2)}%`);
  });
  
  const score11 = scores.find(s => s.score === '1-1');
  const score11Index = scores.findIndex(s => s.score === '1-1');
  
  console.log(`\n   ⚠️  1-1 ACTUAL POSITION: #${score11Index + 1} (${(score11.prob * 100).toFixed(2)}%)`);
  console.log(`   ❌ FRONTEND SHOWS: 1-1 as TOP with ~14% (WRONG!)`);
  
  console.log('\n   🔍 ANALYSIS:');
  const topScore = scores[0];
  if (topScore.score === '1-1') {
    console.log(`      ✅ 1-1 is correctly the most likely score`);
  } else {
    console.log(`      ❌ TOP should be ${topScore.score} (${(topScore.prob * 100).toFixed(2)}%), NOT 1-1`);
    console.log(`      📍 Difference: ${((topScore.prob - score11.prob) * 100).toFixed(2)}%`);
  }
  
  // Check what lambda would make 1-1 the most probable
  console.log('\n   💡 FOR 1-1 TO BE TOP:');
  console.log(`      Need: λHome ≈ 1.0 AND λAway ≈ 1.0`);
  console.log(`      Have: λHome = ${match.lambdaH.toFixed(2)}, λAway = ${match.lambdaA.toFixed(2)}`);
  
  if (Math.abs(match.lambdaH - 1.0) > 0.3 || Math.abs(match.lambdaA - 1.0) > 0.3) {
    console.log(`      ⚠️  Lambda values are TOO FAR from 1.0 for 1-1 to be top!`);
  }
}

console.log('\n\n' + '='.repeat(120));
console.log('\n🐛 BUG IDENTIFIED:\n');
console.log('   The frontend is showing 1-1 as the most likely score for ALL matches,');
console.log('   but the Expected Goals (lambda values) would produce DIFFERENT top scores.\n');

console.log('   🔍 POSSIBLE CAUSES:\n');
console.log('   1️⃣  Exact Goals calculation uses WRONG lambda values');
console.log('      → Using default 1.0/1.0 instead of actual lambdaHome/lambdaAway\n');

console.log('   2️⃣  Exact Goals calculated from EMPIRICAL data, not Poisson');
console.log('      → Historical 1-1 results are overrepresented in training data\n');

console.log('   3️⃣  Blending formula gives too much weight to empirical vs Poisson');
console.log('      → Empirical data suggests 1-1, Poisson is ignored\n');

console.log('   4️⃣  Exact Goals calculation has a BUG in the loop');
console.log('      → Always returns [1,1] regardless of lambda\n');

console.log('\n📍 NEXT STEP: Check exact goals calculation in poisson.ts\n');
