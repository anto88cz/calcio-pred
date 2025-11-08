/**
 * Script per caricare fixtures da Sportsmonks nel database
 * Usage: npx tsx src/scripts/load-fixtures.ts [days]
 */

import { fixturesService } from '../services/sportsmonks';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { FixtureStatus } from '@prisma/client';

async function loadFixtures(days: number = 1) {
  console.log(`\n🔄 Loading fixtures for next ${days} day(s)...\n`);

  try {
    // Start from today (not yesterday)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let totalLoaded = 0;
    let totalUpdated = 0;

    // Fetch per ogni giorno
    for (let d = 0; d < days; d++) {
      const currentDate = new Date(todayStr); // Use ISO string to avoid timezone issues
      currentDate.setDate(currentDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];

      console.log(`\n📅 Fetching fixtures for ${dateStr}...`);

      try {
        // Fetch ALL fixtures per questa data
        const allFixtures = await fixturesService.getFixturesByDate(dateStr);

        if (!allFixtures || allFixtures.length === 0) {
          console.log(`   No fixtures found for ${dateStr}`);
          continue;
        }

        console.log(`   Found ${allFixtures.length} total fixtures`);

        // Salva nel database
        for (const fixture of allFixtures) {
          try {
            const dateObj = new Date(fixture.date);
            
            // Upsert teams and wait for completion
            const homeTeam = await prisma.team.upsert({
              where: { apiId: fixture.homeTeam.id },
              update: {
                name: fixture.homeTeam.name,
                logo: fixture.homeTeam.logo,
              },
              create: {
                apiId: fixture.homeTeam.id,
                name: fixture.homeTeam.name,
                logo: fixture.homeTeam.logo,
                country: fixture.league.country,
              },
            });

            const awayTeam = await prisma.team.upsert({
              where: { apiId: fixture.awayTeam.id },
              update: {
                name: fixture.awayTeam.name,
                logo: fixture.awayTeam.logo,
              },
              create: {
                apiId: fixture.awayTeam.id,
                name: fixture.awayTeam.name,
                logo: fixture.awayTeam.logo,
                country: fixture.league.country,
              },
            });

            // Upsert fixture using internal team IDs (not API IDs!)
            const existing = await prisma.fixture.findUnique({
              where: { apiId: fixture.id },
            });

            if (existing) {
              await prisma.fixture.update({
                where: { apiId: fixture.id },
                data: {
                  date: dateObj,
                  status: fixture.statusShort as FixtureStatus,
                  homeGoals: fixture.score.home,
                  awayGoals: fixture.score.away,
                },
              });
              totalUpdated++;
            } else {
              await prisma.fixture.create({
                data: {
                  apiId: fixture.id,
                  date: dateObj,
                  timestamp: fixture.timestamp,
                  timezone: 'UTC',
                  venue: fixture.venue?.name || 'Unknown',
                  status: fixture.statusShort as FixtureStatus,
                  round: '',
                  homeTeamId: homeTeam.id, // Use internal Prisma ID
                  awayTeamId: awayTeam.id, // Use internal Prisma ID
                  homeGoals: fixture.score.home,
                  awayGoals: fixture.score.away,
                  leagueId: fixture.league.id,
                  leagueName: fixture.league.name,
                  leagueCountry: fixture.league.country,
                  leagueSeason: fixture.league.season,
                },
              });
              totalLoaded++;
            }

            // Delay per rate limit
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err) {
            logger.error({ err, fixtureId: fixture.id }, 'Failed to save fixture');
          }
        }

        console.log(`   ✅ Processed ${allFixtures.length} fixtures`);

        // Delay per rate limit (6 secondi tra date)
        if (d < days - 1) {
          console.log(`   ⏳ Waiting 6s for rate limit...`);
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
      } catch (err) {
        logger.error({ err, date: dateStr }, 'Failed to fetch fixtures for date');
        console.log(`   ❌ Error fetching fixtures for ${dateStr}`);
      }
    }

    console.log(`\n✅ Loading completed!`);
    console.log(`   New fixtures: ${totalLoaded}`);
    console.log(`   Updated fixtures: ${totalUpdated}`);
    console.log(`   Total: ${totalLoaded + totalUpdated}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error loading fixtures:', error);
    process.exit(1);
  }
}

// Parse CLI args
const days = parseInt(process.argv[2] || '2', 10);
loadFixtures(days);
