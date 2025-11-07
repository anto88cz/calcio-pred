// Test correzione Dixon-Coles con RHO positivo
console.log('\n🔧 TESTING DIXON-COLES FIX\n');
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

function calculateDynamicRho(lambdaH, lambdaA) {
  const total = lambdaH + lambdaA;
  if (total > 4.0) return 0.18;
  if (total > 3.0) return 0.15;
  if (total < 1.5) return 0.05;
  if (total < 2.0) return 0.08;
  if (Math.abs(lambdaH - lambdaA) > 1.5) return 0.12;
  return 0.10; // Standard
}

for (const match of matches) {
  console.log(`\n\n📊 ${match.name}`);
  console.log(`   λHome=${match.lambdaH.toFixed(2)}, λAway=${match.lambdaA.toFixed(2)}`);
  console.log('-'.repeat(120));
  
  const rho = calculateDynamicRho(match.lambdaH, match.lambdaA);
  
  // Calcolo Poisson PRIMA correzione
  const prob00_before = poissonProb(match.lambdaH, 0) * poissonProb(match.lambdaA, 0);
  const prob10_before = poissonProb(match.lambdaH, 1) * poissonProb(match.lambdaA, 0);
  const prob01_before = poissonProb(match.lambdaH, 0) * poissonProb(match.lambdaA, 1);
  const prob11_before = poissonProb(match.lambdaH, 1) * poissonProb(match.lambdaA, 1);
  
  // Calcolo tau con RHO POSITIVO
  const tau00 = 1 - match.lambdaH * match.lambdaA * rho;
  const tau10 = 1 + match.lambdaA * rho;
  const tau01 = 1 + match.lambdaH * rho;
  const tau11 = 1 - rho; // Con rho POSITIVO → tau11 < 1 → RIDUCE 1-1 ✅
  
  // Applica correzione
  const prob00_after = prob00_before * tau00;
  const prob10_after = prob10_before * tau10;
  const prob01_after = prob01_before * tau01;
  const prob11_after = prob11_before * tau11;
  
  console.log(`\n   🔢 RHO DINAMICO: ${rho.toFixed(3)} (POSITIVO)`);
  
  console.log('\n   📊 CORREZIONE DIXON-COLES:');
  console.log(`      0-0: ${(prob00_before * 100).toFixed(2)}% → ${(prob00_after * 100).toFixed(2)}% (tau=${tau00.toFixed(3)})`);
  console.log(`      1-0: ${(prob10_before * 100).toFixed(2)}% → ${(prob10_after * 100).toFixed(2)}% (tau=${tau10.toFixed(3)})`);
  console.log(`      0-1: ${(prob01_before * 100).toFixed(2)}% → ${(prob01_after * 100).toFixed(2)}% (tau=${tau01.toFixed(3)})`);
  console.log(`      1-1: ${(prob11_before * 100).toFixed(2)}% → ${(prob11_after * 100).toFixed(2)}% (tau=${tau11.toFixed(3)})`);
  
  // Calcola tutti gli score con correzione
  const scores = [];
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      let prob = poissonProb(match.lambdaH, h) * poissonProb(match.lambdaA, a);
      
      // Applica Dixon-Coles se score basso
      if (h === 0 && a === 0) prob *= tau00;
      else if (h === 1 && a === 0) prob *= tau10;
      else if (h === 0 && a === 1) prob *= tau01;
      else if (h === 1 && a === 1) prob *= tau11;
      
      scores.push({ score: `${h}-${a}`, prob, h, a });
    }
  }
  
  // Normalizza
  const total = scores.reduce((sum, s) => sum + s.prob, 0);
  scores.forEach(s => s.prob /= total);
  
  // Ordina
  scores.sort((a, b) => b.prob - a.prob);
  
  console.log('\n   🎯 TOP 5 DOPO CORREZIONE:');
  scores.slice(0, 5).forEach((s, i) => {
    const marker = i === 0 ? '👉' : '  ';
    console.log(`      ${marker} ${s.score}: ${(s.prob * 100).toFixed(2)}%`);
  });
  
  const score11 = scores.find(s => s.score === '1-1');
  const score11Index = scores.findIndex(s => s.score === '1-1');
  
  console.log(`\n   ✅ 1-1 POSITION: #${score11Index + 1} (${(score11.prob * 100).toFixed(2)}%)`);
  
  if (tau11 < 1.0) {
    console.log(`   ✅ tau11=${tau11.toFixed(3)} < 1.0 → 1-1 RIDOTTO correttamente!`);
  } else {
    console.log(`   ❌ tau11=${tau11.toFixed(3)} >= 1.0 → 1-1 AUMENTATO (BUG!)`);
  }
}

console.log('\n\n' + '='.repeat(120));
console.log('\n✅ FIX APPLICATO: RHO ora è POSITIVO, tau11 = 1 - rho RIDUCE 1-1\n');
console.log('   PRIMA: RHO = -0.10 → tau11 = 1-(-0.10) = 1.10 → 1-1 AUMENTATO del 10% ❌');
console.log('   DOPO:  RHO = +0.10 → tau11 = 1-(+0.10) = 0.90 → 1-1 RIDOTTO del 10% ✅\n');
