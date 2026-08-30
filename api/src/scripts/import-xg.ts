/**
 * Scarica l'xG reale di ogni partita gia' in Postgres e lo salva sulle colonne
 * xg_home / xg_away / xga_home / xga_away.
 *
 * Perche' serve uno script: l'engine leggeva quei campi dallo storico ma
 * nessuno li riempiva mai, quindi calculateAvgXG cadeva sempre sul proxy dei
 * gol (`matchesWithXG: 0` su tutte le 1751 partite del backtest). L'xG pagato
 * nell'abbonamento non entrava mai nel modello.
 *
 * L'add-on non espone l'xG dentro `statistics`: e' un include separato,
 * `xGFixture`, con una riga per squadra e per metrica. type_id 5304 = xG.
 *
 * Si usa /fixtures/multi/{ids}, che accetta piu' id in una chiamata sola: con
 * il pacing di 1.6s imposto dal piano Growth la differenza e' fra un'ora e
 * mezza e un paio di minuti.
 *
 * Idempotente e riprendibile: salta le partite che hanno gia' l'xG, quindi si
 * puo' rilanciare dopo un'interruzione.
 *
 * Uso:
 *   npx tsx src/scripts/import-xg.ts
 *   npx tsx src/scripts/import-xg.ts --batch 25 --force
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';

const prisma = new PrismaClient();

const XG_TYPE_ID = 5304;

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const batchSize = parseInt(arg('--batch', '25'), 10);
  const force = process.argv.includes('--force');

  const fixtures = await prisma.fixture.findMany({
    where: {
      status: FixtureStatus.FINISHED,
      ...(force ? {} : { xg_home: null }),
    },
    select: { id: true, apiId: true, date: true },
    orderBy: { date: 'asc' },
  });

  const total = await prisma.fixture.count({ where: { status: FixtureStatus.FINISHED } });
  console.log(`Partite concluse in archivio: ${total}`);
  console.log(`Da scaricare:                 ${fixtures.length}${force ? ' (--force: anche quelle gia fatte)' : ''}`);
  if (fixtures.length === 0) {
    console.log('Niente da fare.');
    await prisma.$disconnect();
    return;
  }
  console.log(`Chiamate previste:            ${Math.ceil(fixtures.length / batchSize)} da ${batchSize} partite\n`);

  const client = getSportsmonksClient();
  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (let i = 0; i < fixtures.length; i += batchSize) {
    const chunk = fixtures.slice(i, i + batchSize);
    const ids = chunk.map(f => f.apiId).join(',');

    let rows: any[] = [];
    try {
      const response: any = await client.get(`/fixtures/multi/${ids}`, { include: 'xGFixture' });
      rows = Array.isArray(response?.data) ? response.data : [];
    } catch (error: any) {
      failed += chunk.length;
      console.error(`  blocco ${i}-${i + chunk.length}: ${error.message}`);
      continue;
    }

    const byApiId = new Map<number, any>(rows.map((r: any) => [r.id, r]));

    for (const f of chunk) {
      const data = byApiId.get(f.apiId);
      const xgRows: any[] = data?.xgfixture ?? [];

      const pick = (location: 'home' | 'away'): number | null => {
        const row = xgRows.find(r => r.location === location && r.type_id === XG_TYPE_ID);
        const value = row?.data?.value;
        return typeof value === 'number' ? value : null;
      };

      const home = pick('home');
      const away = pick('away');

      if (home === null || away === null) {
        missing++;
        continue;
      }

      await prisma.fixture.update({
        where: { id: f.id },
        data: {
          xg_home: home,
          xg_away: away,
          // gli xG concessi sono, per definizione, quelli prodotti dall'altra
          // squadra: si salvano espliciti perche' lo storico li legge cosi'.
          xga_home: away,
          xga_away: home,
        },
      });
      updated++;
    }

    const done = Math.min(i + batchSize, fixtures.length);
    if (done % (batchSize * 10) === 0 || done === fixtures.length) {
      console.log(`  ${done}/${fixtures.length}  salvate ${updated}, senza xG ${missing}, errori ${failed}`);
    }
  }

  console.log(`\nSalvate ${updated} partite con xG reale.`);
  if (missing) console.log(`${missing} partite senza xG nella risposta dell'API.`);
  if (failed) console.log(`${failed} partite in blocchi falliti: rilanciare per riprendere.`);

  const withXg = await prisma.fixture.count({ where: { status: FixtureStatus.FINISHED, xg_home: { not: null } } });
  console.log(`Copertura: ${withXg}/${total} (${((withXg / total) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('Errore:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
