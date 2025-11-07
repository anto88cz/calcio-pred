// Check quali fixtures abbiamo disponibili per backtesting
const { PrismaClient, FixtureStatus } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFixtures() {
  console.log('🔍 Checking fixtures available for backtesting...\n');
  
  try {
    // Check total fixtures
    const total = await prisma.fixture.count();
    console.log(`Total fixtures in DB: ${total}\n`);
    
    // Check finished fixtures (FT status)
    const finished = await prisma.fixture.count({
      where: {
        status: FixtureStatus.FT,
        homeGoals: { not: null },
        awayGoals: { not: null },
      }
    });
    console.log(`Finished fixtures (FT): ${finished}\n`);
    
    // Check by league
    const leagues = await prisma.fixture.groupBy({
      by: ['leagueId', 'leagueName'],
      where: {
        status: FixtureStatus.FT,
        homeGoals: { not: null },
        awayGoals: { not: null },
      },
      _count: true,
    });
    
    console.log('Finished fixtures by league:');
    leagues.forEach(league => {
      console.log(`   ${league.leagueName} (ID: ${league.leagueId}): ${league._count} matches`);
    });
    console.log('');
    
    // Check date range
    const dateRange = await prisma.fixture.aggregate({
      where: {
        status: FixtureStatus.FT,
        homeGoals: { not: null },
        awayGoals: { not: null },
      },
      _min: { date: true },
      _max: { date: true },
    });
    
    if (dateRange._min.date && dateRange._max.date) {
      console.log('Date range of finished fixtures:');
      console.log(`   From: ${dateRange._min.date.toISOString().split('T')[0]}`);
      console.log(`   To:   ${dateRange._max.date.toISOString().split('T')[0]}\n`);
    }
    
    // Suggest backtest command
    if (finished > 0 && leagues.length > 0) {
      const bestLeague = leagues.reduce((a, b) => a._count > b._count ? a : b);
      const startDate = dateRange._min.date.toISOString().split('T')[0];
      const endDate = dateRange._max.date.toISOString().split('T')[0];
      
      console.log('✅ RECOMMENDED BACKTEST COMMAND:');
      console.log(`   cd api && npx tsx src/scripts/run-backtest.ts \\`);
      console.log(`     --start ${startDate} \\`);
      console.log(`     --end ${endDate} \\`);
      console.log(`     --leagues ${bestLeague.leagueId} \\`);
      console.log(`     --limit ${Math.min(20, finished)}`);
      console.log('');
    } else {
      console.log('⚠️  NO FINISHED FIXTURES AVAILABLE FOR BACKTESTING');
      console.log('   You need to load historical fixtures first.');
      console.log('   Run: cd api && npx tsx src/scripts/load-fixtures.ts 7');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkFixtures();
