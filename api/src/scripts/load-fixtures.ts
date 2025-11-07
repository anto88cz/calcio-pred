/**
 * Script per caricare fixtures da API-FOOTBALL nel database
 * Usage: npx tsx src/scripts/load-fixtures.ts [days]
 */

import { fixturesService } from '../services/api-football';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { FixtureStatus } from '@prisma/client';

async function loadFixtures(days: number = 1) {
  console.log(`\n🔄 Loading fixtures for next ${days} day(s)...\ n`);

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

        // Filtra top leagues + European competitions
        // Top 5: Premier(39), SerieA(135), LaLiga(140), Bundesliga(78), Ligue1(61)
        // European: Champions(2), Europa(3), Conference(848)
        const topLeagueIds = [39, 135, 140, 78, 61, 2, 3, 848];
        const fixtures = allFixtures.filter(f => topLeagueIds.includes(f.league.id));

        console.log(`   Found ${fixtures.length} top league fixtures`);

        // Salva nel database
        for (const fixture of fixtures) {
          try {
            // Upsert teams and wait for completion
            const homeTeam = await prisma.team.upsert({
              where: { apiId: fixture.teams.home.id },
              update: {
                name: fixture.teams.home.name,
                logo: fixture.teams.home.logo,
              },
              create: {
                apiId: fixture.teams.home.id,
                name: fixture.teams.home.name,
                logo: fixture.teams.home.logo,
                country: 'Unknown',
              },
            });

            const awayTeam = await prisma.team.upsert({
              where: { apiId: fixture.teams.away.id },
              update: {
                name: fixture.teams.away.name,
                logo: fixture.teams.away.logo,
              },
              create: {
                apiId: fixture.teams.away.id,
                name: fixture.teams.away.name,
                logo: fixture.teams.away.logo,
                country: 'Unknown',
              },
            });

            // Upsert fixture using internal team IDs (not API IDs!)
            const existing = await prisma.fixture.findUnique({
              where: { apiId: fixture.fixture.id },
            });

            if (existing) {
              await prisma.fixture.update({
                where: { apiId: fixture.fixture.id },
                data: {
                  date: new Date(fixture.fixture.date),
                  status: fixture.fixture.status.short as FixtureStatus,
                  homeGoals: fixture.goals.home,
                  awayGoals: fixture.goals.away,
                },
              });
              totalUpdated++;
            } else {
              await prisma.fixture.create({
                data: {
                  apiId: fixture.fixture.id,
                  date: new Date(fixture.fixture.date),
                  timestamp: fixture.fixture.timestamp,
                  timezone: fixture.fixture.timezone,
                  venue: fixture.fixture.venue.name || 'Unknown',
                  status: fixture.fixture.status.short as FixtureStatus,
                  round: fixture.league.round,
                  homeTeamId: homeTeam.id, // Use internal Prisma ID
                  awayTeamId: awayTeam.id, // Use internal Prisma ID
                  homeGoals: fixture.goals.home,
                  awayGoals: fixture.goals.away,
                  leagueId: fixture.league.id,
                  leagueName: fixture.league.name,
                  leagueCountry: fixture.league.country,
                  leagueSeason: fixture.league.season,
                },
              });
              totalLoaded++;
            }

            // Delay per rate limit (piano free: 10 req/min)
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err) {
            logger.error({ err, fixtureId: fixture.fixture.id }, 'Failed to save fixture');
          }
        }

        console.log(`   ✅ Processed ${fixtures.length} fixtures`);

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
