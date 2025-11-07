import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeToday() {
  try {
    // Get today's fixtures
    const today = new Date('2025-11-07T00:00:00Z');
    const tomorrow = new Date('2025-11-08T00:00:00Z');
    
    console.log(`\n🔍 ANALYZING PREDICTIONS FOR ${today.toISOString().split('T')[0]}\n`);
    console.log('='.repeat(120));
    
    const predictions = await prisma.prediction.findMany({
      where: {
        fixture: {
          date: {
            gte: today,
            lt: tomorrow
          }
        }
      },
      include: {
        fixture: {
          include: {
            homeTeam: true,
            awayTeam: true
          }
        }
      },
      orderBy: {
        fixture: {
          date: 'asc'
        }
      }
    });
    
    if (predictions.length === 0) {
      console.log('\n❌ No predictions found for today');
      return;
    }
    
    console.log(`\nFound ${predictions.length} predictions\n`);
    
    for (const pred of predictions) {
      const fixture = pred.fixture;
      
      console.log(`\n${'='.repeat(120)}`);
      console.log(`\n🏟️  ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
      console.log(`    League: ${fixture.leagueName} (ID: ${fixture.leagueId})`);
      console.log(`    Date: ${fixture.date.toISOString()}`);
      console.log(`    Status: ${fixture.status}`);
      
      console.log(`\n📊 POISSON PARAMETERS:`);
      console.log(`    λ Home: ${pred.lambdaHome?.toFixed(3) || 'N/A'}`);
      console.log(`    λ Away: ${pred.lambdaAway?.toFixed(3) || 'N/A'}`);
      console.log(`    Home Advantage: ${pred.homeAdvantage?.toFixed(3) || 'N/A'}`);
      
      console.log(`\n🎲 1X2 PROBABILITIES:`);
      console.log(`    Home Win (1): ${(pred.prob1Final * 100).toFixed(1)}%`);
      console.log(`    Draw (X):     ${(pred.probXFinal * 100).toFixed(1)}%`);
      console.log(`    Away Win (2): ${(pred.prob2Final * 100).toFixed(1)}%`);
      console.log(`    Strength:     ${pred.strength1X2}`);
      
      // Calculate most likely exact score using Poisson
      const lambdaH = pred.lambdaHome || 1;
      const lambdaA = pred.lambdaAway || 1;
      
      console.log(`\n⚽ TOP 5 MOST LIKELY SCORES (Poisson):`);
      
      const scores: Array<{ score: string; prob: number }> = [];
      
      // Calculate probabilities for scores 0-0 to 5-5
      for (let h = 0; h <= 5; h++) {
        for (let a = 0; a <= 5; a++) {
          // Poisson probability mass function
          const probH = (Math.pow(lambdaH, h) * Math.exp(-lambdaH)) / factorial(h);
          const probA = (Math.pow(lambdaA, a) * Math.exp(-lambdaA)) / factorial(a);
          const prob = probH * probA;
          
          scores.push({ score: `${h}-${a}`, prob });
        }
      }
      
      // Sort by probability
      scores.sort((a, b) => b.prob - a.prob);
      
      scores.slice(0, 5).forEach((s, i) => {
        const isTopScore = i === 0;
        const marker = isTopScore ? '👉' : '  ';
        console.log(`    ${marker} ${s.score}: ${(s.prob * 100).toFixed(2)}%`);
      });
      
      console.log(`\n⚽ GOALS MARKETS:`);
      console.log(`    Over 0.5: ${(pred.probOver05Final * 100).toFixed(1)}% (${pred.strengthOver05})`);
      console.log(`    Over 1.5: ${(pred.probOver15Final * 100).toFixed(1)}% (${pred.strengthOver15})`);
      console.log(`    Over 2.5: ${(pred.probOver25Final * 100).toFixed(1)}% (${pred.strengthOver25})`);
      console.log(`    Over 3.5: ${(pred.probOver35Final * 100).toFixed(1)}% (${pred.strengthOver35})`);
      
      console.log(`\n🔍 DATA QUALITY:`);
      console.log(`    Confidence: ${(pred.confidence * 100).toFixed(1)}% (${pred.confidenceLevel})`);
      console.log(`    Home Matches Used: ${pred.homeMatchesUsed}`);
      console.log(`    Away Matches Used: ${pred.awayMatchesUsed}`);
      console.log(`    Data Quality: ${pred.dataQuality}`);
      
      // Analyze if all scores are the same
      const topScore = scores[0];
      const secondScore = scores[1];
      const probDiff = topScore.prob - secondScore.prob;
      
      console.log(`\n🎯 ANALYSIS:`);
      console.log(`    Most Likely: ${topScore.score} (${(topScore.prob * 100).toFixed(2)}%)`);
      console.log(`    2nd Most Likely: ${secondScore.score} (${(secondScore.prob * 100).toFixed(2)}%)`);
      console.log(`    Difference: ${(probDiff * 100).toFixed(2)}%`);
      
      if (topScore.score === '1-1' && lambdaH > 0.8 && lambdaH < 1.2 && lambdaA > 0.8 && lambdaA < 1.2) {
        console.log(`    ⚠️  WARNING: Lambda values are very similar (${lambdaH.toFixed(2)} vs ${lambdaA.toFixed(2)})`);
        console.log(`    This suggests both teams have similar attack strength`);
        console.log(`    Result: Poisson distribution peaks at 1-1`);
      }
      
      // Check team stats
      console.log(`\n📈 TEAM STATS:`);
      console.log(`    ${fixture.homeTeam.name}:`);
      console.log(`       Goals Scored: ${fixture.homeTeam.goalsScored}`);
      console.log(`       Goals Conceded: ${fixture.homeTeam.goalsConceded}`);
      console.log(`       Matches Played: ${fixture.homeTeam.matchesPlayed}`);
      
      console.log(`    ${fixture.awayTeam.name}:`);
      console.log(`       Goals Scored: ${fixture.awayTeam.goalsScored}`);
      console.log(`       Goals Conceded: ${fixture.awayTeam.goalsConceded}`);
      console.log(`       Matches Played: ${fixture.awayTeam.matchesPlayed}`);
    }
    
    console.log(`\n${'='.repeat(120)}\n`);
    
    // Summary
    const allScores = predictions.map(p => {
      const lambdaH = p.lambdaHome || 1;
      const lambdaA = p.lambdaAway || 1;
      
      const scores: Array<{ score: string; prob: number }> = [];
      for (let h = 0; h <= 5; h++) {
        for (let a = 0; a <= 5; a++) {
          const probH = (Math.pow(lambdaH, h) * Math.exp(-lambdaH)) / factorial(h);
          const probA = (Math.pow(lambdaA, a) * Math.exp(-lambdaA)) / factorial(a);
          scores.push({ score: `${h}-${a}`, prob: probH * probA });
        }
      }
      scores.sort((a, b) => b.prob - a.prob);
      return { 
        match: `${p.fixture.homeTeam.name} - ${p.fixture.awayTeam.name}`,
        topScore: scores[0].score,
        lambdaH,
        lambdaA
      };
    });
    
    console.log('\n📊 SUMMARY:');
    console.log(`Total predictions: ${predictions.length}`);
    console.log(`Predictions with 1-1 as top score: ${allScores.filter(s => s.topScore === '1-1').length}`);
    
    console.log('\n🔍 PROBLEM DIAGNOSIS:');
    const similarLambdas = allScores.filter(s => Math.abs(s.lambdaH - s.lambdaA) < 0.3);
    if (similarLambdas.length === allScores.length) {
      console.log('❌ ALL matches have similar lambda values for home and away');
      console.log('   This means the model is not differentiating between teams properly');
      console.log('\n   Possible causes:');
      console.log('   1. Team stats (form, xG) are not being calculated correctly');
      console.log('   2. Not enough historical matches for proper differentiation');
      console.log('   3. League strength adjustment is neutralizing differences');
      console.log('   4. Home advantage is not being applied properly');
    } else {
      console.log('✅ Lambda values vary between matches (model is working)');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

function factorial(n: number): number {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

analyzeToday();
