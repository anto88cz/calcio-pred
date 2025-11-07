import { PrismaClient } from '@prisma/client';
import { predictionEngine } from '../services/prediction';

const prisma = new PrismaClient();

async function generateTodayPredictions() {
  try {
    const today = new Date('2025-11-07T00:00:00Z');
    const tomorrow = new Date('2025-11-08T00:00:00Z');
    
    console.log('\n🔄 Generating predictions for today...\n');
    
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
    
    console.log(`Found ${fixtures.length} fixtures\n`);
    
    for (const fixture of fixtures) {
      console.log(`📊 ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}...`);
      
      try {
        const prediction = await predictionEngine.calculatePrediction({
          fixtureId: fixture.id,
          homeTeamId: fixture.homeTeam.apiId,
          awayTeamId: fixture.awayTeam.apiId,
          season: fixture.leagueSeason,
          leagueId: fixture.leagueId,
        });
        
        // Save prediction
        await prisma.prediction.upsert({
          where: { fixtureId: fixture.id },
          create: {
            fixtureId: fixture.id,
            providerFixtureId: fixture.apiId,
            confidence: prediction.confidence,
            confidenceLevel: prediction.confidenceLevel,
            homeMatchesUsed: prediction.homeMatchesUsed,
            awayMatchesUsed: prediction.awayMatchesUsed,
            dataQuality: prediction.dataQuality,
            hasInjuries: prediction.hasInjuries,
            hasLineup: prediction.hasLineup,
            prob1Empiric: prediction.market1X2.empiric.prob1,
            probXEmpiric: prediction.market1X2.empiric.probX,
            prob2Empiric: prediction.market1X2.empiric.prob2,
            prob1Poisson: prediction.market1X2.poisson.prob1,
            probXPoisson: prediction.market1X2.poisson.probX,
            prob2Poisson: prediction.market1X2.poisson.prob2,
            prob1Final: prediction.market1X2.final.prob1,
            probXFinal: prediction.market1X2.final.probX,
            prob2Final: prediction.market1X2.final.prob2,
            strength1X2: prediction.market1X2.strength,
            probUnder05Empiric: prediction.marketUnderOver['0.5'].empiric.under,
            probOver05Empiric: prediction.marketUnderOver['0.5'].empiric.over,
            probUnder05Poisson: prediction.marketUnderOver['0.5'].poisson.under,
            probOver05Poisson: prediction.marketUnderOver['0.5'].poisson.over,
            probUnder05Final: prediction.marketUnderOver['0.5'].final.under,
            probOver05Final: prediction.marketUnderOver['0.5'].final.over,
            strengthOver05: prediction.marketUnderOver['0.5'].strength,
            probUnder15Empiric: prediction.marketUnderOver['1.5'].empiric.under,
            probOver15Empiric: prediction.marketUnderOver['1.5'].empiric.over,
            probUnder15Poisson: prediction.marketUnderOver['1.5'].poisson.under,
            probOver15Poisson: prediction.marketUnderOver['1.5'].poisson.over,
            probUnder15Final: prediction.marketUnderOver['1.5'].final.under,
            probOver15Final: prediction.marketUnderOver['1.5'].final.over,
            strengthOver15: prediction.marketUnderOver['1.5'].strength,
            probUnder25Empiric: prediction.marketUnderOver['2.5'].empiric.under,
            probOver25Empiric: prediction.marketUnderOver['2.5'].empiric.over,
            probUnder25Poisson: prediction.marketUnderOver['2.5'].poisson.under,
            probOver25Poisson: prediction.marketUnderOver['2.5'].poisson.over,
            probUnder25Final: prediction.marketUnderOver['2.5'].final.under,
            probOver25Final: prediction.marketUnderOver['2.5'].final.over,
            strengthOver25: prediction.marketUnderOver['2.5'].strength,
            probUnder35Empiric: prediction.marketUnderOver['3.5'].empiric.under,
            probOver35Empiric: prediction.marketUnderOver['3.5'].empiric.over,
            probUnder35Poisson: prediction.marketUnderOver['3.5'].poisson.under,
            probOver35Poisson: prediction.marketUnderOver['3.5'].poisson.over,
            probUnder35Final: prediction.marketUnderOver['3.5'].final.under,
            probOver35Final: prediction.marketUnderOver['3.5'].final.over,
            strengthOver35: prediction.marketUnderOver['3.5'].strength,
            probUnder45Empiric: prediction.marketUnderOver['4.5'].empiric.under,
            probOver45Empiric: prediction.marketUnderOver['4.5'].empiric.over,
            probUnder45Poisson: prediction.marketUnderOver['4.5'].poisson.under,
            probOver45Poisson: prediction.marketUnderOver['4.5'].poisson.over,
            probUnder45Final: prediction.marketUnderOver['4.5'].final.under,
            probOver45Final: prediction.marketUnderOver['4.5'].final.over,
            strengthOver45: prediction.marketUnderOver['4.5'].strength,
            probBttsYesEmpiric: prediction.marketBTTS.empiric.yes,
            probBttsNoEmpiric: prediction.marketBTTS.empiric.no,
            probBttsYesPoisson: prediction.marketBTTS.poisson.yes,
            probBttsNoPoisson: prediction.marketBTTS.poisson.no,
            probBttsYesFinal: prediction.marketBTTS.final.yes,
            probBttsNoFinal: prediction.marketBTTS.final.no,
            strengthBtts: prediction.marketBTTS.strength,
            prob1XEmpiric: prediction.marketDoubleChance['1X'].empiric.prob,
            prob1XPoisson: prediction.marketDoubleChance['1X'].poisson.prob,
            prob1XFinal: prediction.marketDoubleChance['1X'].final.prob,
            strength1X: prediction.marketDoubleChance['1X'].strength,
            prob12Empiric: prediction.marketDoubleChance['12'].empiric.prob,
            prob12Poisson: prediction.marketDoubleChance['12'].poisson.prob,
            prob12Final: prediction.marketDoubleChance['12'].final.prob,
            strength12: prediction.marketDoubleChance['12'].strength,
            probX2Empiric: prediction.marketDoubleChance['X2'].empiric.prob,
            probX2Poisson: prediction.marketDoubleChance['X2'].poisson.prob,
            probX2Final: prediction.marketDoubleChance['X2'].final.prob,
            strengthX2: prediction.marketDoubleChance['X2'].strength,
            lambdaHome: prediction.poissonParams.lambdaHome,
            lambdaAway: prediction.poissonParams.lambdaAway,
            homeAdvantage: prediction.poissonParams.homeAdvantage,
            calculatedAt: prediction.calculatedAt,
            lastUpdate: new Date(),
          },
          update: {
            confidence: prediction.confidence,
            confidenceLevel: prediction.confidenceLevel,
            homeMatchesUsed: prediction.homeMatchesUsed,
            awayMatchesUsed: prediction.awayMatchesUsed,
            dataQuality: prediction.dataQuality,
            prob1Final: prediction.market1X2.final.prob1,
            probXFinal: prediction.market1X2.final.probX,
            prob2Final: prediction.market1X2.final.prob2,
            lambdaHome: prediction.poissonParams.lambdaHome,
            lambdaAway: prediction.poissonParams.lambdaAway,
            lastUpdate: new Date(),
          }
        });
        
        console.log(`   ✅ Generated - λH: ${prediction.poissonParams.lambdaHome.toFixed(3)}, λA: ${prediction.poissonParams.lambdaAway.toFixed(3)}`);
        
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

generateTodayPredictions();
