import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTodayFixtures() {
  try {
    const today = new Date('2025-11-07T00:00:00Z');
    const tomorrow = new Date('2025-11-08T00:00:00Z');
    
    console.log(`\n🔍 Checking fixtures for ${today.toISOString().split('T')[0]}\n`);
    
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
    
    console.log(`Found ${fixtures.length} fixtures:\n`);
    
    for (const f of fixtures) {
      console.log(`ID: ${f.id} (API: ${f.apiId})`);
      console.log(`   ${f.homeTeam.name} vs ${f.awayTeam.name}`);
      console.log(`   League: ${f.leagueName} (ID: ${f.leagueId})`);
      console.log(`   Date: ${f.date.toISOString()}`);
      console.log(`   Status: ${f.status}\n`);
    }
    
    // Check if predictions exist
    for (const f of fixtures) {
      const pred = await prisma.prediction.findUnique({
        where: { fixtureId: f.id }
      });
      
      if (pred) {
        console.log(`✅ Prediction exists for fixture ${f.id}`);
      } else {
        console.log(`❌ NO PREDICTION for fixture ${f.id} - ${f.homeTeam.name} vs ${f.awayTeam.name}`);
      }
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTodayFixtures();
