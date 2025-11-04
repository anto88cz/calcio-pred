/**
 * Script per popolare il database con squadre comuni
 */

import prisma from '../lib/prisma';
import logger from '../utils/logger';

const commonTeams = [
  // Champions League - Top Teams
  { apiId: 50, name: 'Manchester City', country: 'England', logo: 'https://media.api-sports.io/football/teams/50.png' },
  { apiId: 33, name: 'Manchester United', country: 'England', logo: 'https://media.api-sports.io/football/teams/33.png' },
  { apiId: 40, name: 'Liverpool', country: 'England', logo: 'https://media.api-sports.io/football/teams/40.png' },
  { apiId: 49, name: 'Chelsea', country: 'England', logo: 'https://media.api-sports.io/football/teams/49.png' },
  { apiId: 42, name: 'Arsenal', country: 'England', logo: 'https://media.api-sports.io/football/teams/42.png' },
  
  { apiId: 541, name: 'Real Madrid', country: 'Spain', logo: 'https://media.api-sports.io/football/teams/541.png' },
  { apiId: 529, name: 'Barcelona', country: 'Spain', logo: 'https://media.api-sports.io/football/teams/529.png' },
  { apiId: 530, name: 'Atletico Madrid', country: 'Spain', logo: 'https://media.api-sports.io/football/teams/530.png' },
  
  { apiId: 157, name: 'Bayern Munich', country: 'Germany', logo: 'https://media.api-sports.io/football/teams/157.png' },
  { apiId: 165, name: 'Borussia Dortmund', country: 'Germany', logo: 'https://media.api-sports.io/football/teams/165.png' },
  { apiId: 168, name: 'Bayer Leverkusen', country: 'Germany', logo: 'https://media.api-sports.io/football/teams/168.png' },
  
  { apiId: 489, name: 'Inter', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/489.png' },
  { apiId: 487, name: 'AC Milan', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/487.png' },
  { apiId: 496, name: 'Juventus', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/496.png' },
  { apiId: 497, name: 'AS Roma', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/497.png' },
  { apiId: 492, name: 'Napoli', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/492.png' },
  
  { apiId: 85, name: 'Paris Saint Germain', country: 'France', logo: 'https://media.api-sports.io/football/teams/85.png' },
  { apiId: 91, name: 'Monaco', country: 'France', logo: 'https://media.api-sports.io/football/teams/91.png' },
  { apiId: 81, name: 'Marseille', country: 'France', logo: 'https://media.api-sports.io/football/teams/81.png' },
  
  { apiId: 212, name: 'Porto', country: 'Portugal', logo: 'https://media.api-sports.io/football/teams/212.png' },
  { apiId: 211, name: 'Benfica', country: 'Portugal', logo: 'https://media.api-sports.io/football/teams/211.png' },
  { apiId: 228, name: 'Sporting CP', country: 'Portugal', logo: 'https://media.api-sports.io/football/teams/228.png' },
  
  { apiId: 720, name: 'Celtic', country: 'Scotland', logo: 'https://media.api-sports.io/football/teams/720.png' },
  { apiId: 600, name: 'PSV Eindhoven', country: 'Netherlands', logo: 'https://media.api-sports.io/football/teams/600.png' },
  { apiId: 610, name: 'Ajax', country: 'Netherlands', logo: 'https://media.api-sports.io/football/teams/610.png' },
  
  // Premier League
  { apiId: 47, name: 'Tottenham', country: 'England', logo: 'https://media.api-sports.io/football/teams/47.png' },
  { apiId: 34, name: 'Newcastle', country: 'England', logo: 'https://media.api-sports.io/football/teams/34.png' },
  { apiId: 66, name: 'Aston Villa', country: 'England', logo: 'https://media.api-sports.io/football/teams/66.png' },
  { apiId: 48, name: 'West Ham', country: 'England', logo: 'https://media.api-sports.io/football/teams/48.png' },
  { apiId: 51, name: 'Brighton', country: 'England', logo: 'https://media.api-sports.io/football/teams/51.png' },
  
  // Serie A
  { apiId: 488, name: 'Atalanta', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/488.png' },
  { apiId: 502, name: 'Fiorentina', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/502.png' },
  { apiId: 487, name: 'Lazio', country: 'Italy', logo: 'https://media.api-sports.io/football/teams/487.png' },
  
  // La Liga
  { apiId: 532, name: 'Valencia', country: 'Spain', logo: 'https://media.api-sports.io/football/teams/532.png' },
  { apiId: 533, name: 'Villarreal', country: 'Spain', logo: 'https://media.api-sports.io/football/teams/533.png' },
  { apiId: 548, name: 'Real Sociedad', country: 'Spain', logo: 'https://media.api-sports.io/football/teams/548.png' },
  
  // Bundesliga
  { apiId: 173, name: 'RB Leipzig', country: 'Germany', logo: 'https://media.api-sports.io/football/teams/173.png' },
  { apiId: 160, name: 'Freiburg', country: 'Germany', logo: 'https://media.api-sports.io/football/teams/160.png' },
  
  // Ligue 1
  { apiId: 80, name: 'Lyon', country: 'France', logo: 'https://media.api-sports.io/football/teams/80.png' },
  { apiId: 84, name: 'Nice', country: 'France', logo: 'https://media.api-sports.io/football/teams/84.png' },
];

export async function seedCommonTeams() {
  logger.info('Starting to seed common teams...');
  
  let count = 0;
  
  for (const team of commonTeams) {
    try {
      await prisma.team.upsert({
        where: { apiId: team.apiId },
        update: {
          name: team.name,
          country: team.country,
          logo: team.logo,
        },
        create: {
          apiId: team.apiId,
          name: team.name,
          country: team.country,
          logo: team.logo,
        },
      });
      count++;
    } catch (error) {
      logger.error({ error, team: team.name }, 'Error seeding team');
    }
  }
  
  logger.info({ count }, 'Common teams seeded successfully');
  return count;
}
