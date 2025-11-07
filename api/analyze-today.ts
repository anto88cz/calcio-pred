import { PrismaClient } from '@prisma/client';
import { PredictionService } from './src/services/prediction/prediction.service';

const prisma = new PrismaClient();
const predictionService = new PredictionService(prisma);

async function analyzeToday() {
  try {
    // Get today's fixtures
    const today = new Date('2025-11-07');
    const tomorrow = new Date('2025-11-08');
    
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: {
          gte: today,
          lt: tomorrow
        }
      },
      include: {
        homeTeam: true,
        awayTeam: true
      },
      orderBy: {
        date: 'asc'
      }
    });
    
    console.log(`\n🔍 Analyzing ${fixtures.length} fixtures for today (${today.toISOString().split('T')[0]})\n`);
    console.log('='.repeat(100));
    
    for (const fixture of fixtures) {
      console.log(`\n📊 ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
      console.log(`   League: ${fixture.leagueName} | Date: ${fixture.date.toISOString()}`);
      console.log(`   Status: ${fixture.status}\n`);
      
      try {
        // Get prediction
        const prediction = await predictionService.getPrediction(fixture.id);
        
        console.log('   📈 PREDICTIONS:');
        console.log(`      Home Win: ${(prediction.homeWinProbability * 100).toFixed(1)}%`);
        console.log(`      Draw:     ${(prediction.drawProbability * 100).toFixed(1)}%`);
        console.log(`      Away Win: ${(prediction.awayWinProbability * 100).toFixed(1)}%`);
        console.log(`      Strength: ${prediction.predictionStrength}\n`);
        
        console.log('   ⚽ EXACT GOALS:');
        if (prediction.exactGoalsProbabilities) {
          const sorted = Object.entries(prediction.exactGoalsProbabilities)
            .sort(([a], [b]) => {
              const [ah, aa] = a.split('-').map(Number);
              const [bh, ba] = b.split('-').map(Number);
              return prediction.exactGoalsProbabilities[b] - prediction.exactGoalsProbabilities[a];
            });
          
          sorted.slice(0, 5).forEach(([score, prob]) => {
            console.log(`      ${score}: ${(prob * 100).toFixed(1)}%`);
          });
        }
        
        console.log('\n   🎯 RECOMMENDATION:');
        console.log(`      Outcome: ${prediction.predictedOutcome}`);
        console.log(`      Most Likely Score: ${prediction.mostLikelyScore || 'N/A'}`);
        
        // Analyze why it might predict 1-1
        console.log('\n   🔎 ANALYSIS:');
        console.log(`      Home xG (recent): ${fixture.homeTeam.recentXgFor?.toFixed(2) || 'N/A'}`);
        console.log(`      Away xG (recent): ${fixture.awayTeam.recentXgFor?.toFixed(2) || 'N/A'}`);
        console.log(`      Home Form: ${fixture.homeTeam.recentHomeForm?.toFixed(2) || 'N/A'}`);
        console.log(`      Away Form: ${fixture.awayTeam.recentAwayForm?.toFixed(2) || 'N/A'}`);
        
      } catch (error: any) {
        console.log(`   ❌ Error getting prediction: ${error.message}`);
      }
      
      console.log('\n' + '='.repeat(100));
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeToday();
