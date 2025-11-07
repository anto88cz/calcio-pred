/**
 * Script per popolare il DB con le squadre comuni
 */

import { seedCommonTeams } from './utils/seedTeams';

async function main() {
  console.log('🌱 Seeding database with common teams...');
  const count = await seedCommonTeams();
  console.log(`✅ Seeded ${count} teams successfully!`);
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error seeding teams:', error);
  process.exit(1);
});
