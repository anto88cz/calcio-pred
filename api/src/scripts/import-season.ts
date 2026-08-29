/**
 * Importa una stagione di partite concluse da Sportmonks dentro Postgres,
 * per poter lanciare il backtester (che legge da DB, non dall'API).
 *
 * Uso:
 *   npx tsx src/scripts/import-season.ts 2025-07-01 2026-06-30 384,8,564,82,301
 *
 * Idempotente: rilanciarlo aggiorna le partite gia' presenti invece di duplicarle.
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { PrismaClient, FixtureStatus } from '@prisma/client';

const prisma = new PrismaClient();

const API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE = process.env.SPORTSMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football';

if (!API_KEY) {
  console.error('SPORTSMONKS_API_KEY non impostata');
  process.exit(1);
}

const [, , fromArg, toArg, leaguesArg] = process.argv;
const FROM = fromArg || '2025-07-01';
const TO = toArg || '2026-06-30';
const LEAGUES = (leaguesArg || '384,8,564,82,301').split(',').map(Number);

/** Sportmonks accetta finestre ampie ma pagina a 50: si va a blocchi di 30 giorni. */
const WINDOW_DAYS = 30;

type ApiFixture = {
  id: number;
  name?: string;
  starting_at: string;
  league_id: number;
  season_id: number;
  round?: { name?: string };
  venue?: { name?: string };
  league?: { id: number; name: string; country_id: number };
  state?: { short_name?: string; developer_name?: string };
  participants?: Array<{
    id: number;
    name: string;
    short_code?: string;
    image_path?: string;
    country_id?: number;
    meta?: { location?: 'home' | 'away' };
  }>;
  scores?: Array<{
    participant_id: number;
    description: string;
    score?: { goals?: number; participant?: string };
  }>;
};

async function fetchWindow(from: string, to: string): Promise<ApiFixture[]> {
  const out: ApiFixture[] = [];
  let page = 1;

  for (;;) {
    const res = await axios.get(`${BASE}/fixtures/between/${from}/${to}`, {
      params: {
        api_token: API_KEY,
        filters: `fixtureLeagues:${LEAGUES.join(',')}`,
        include: 'participants;scores;league;state;round;venue',
        per_page: 50,
        page,
      },
      timeout: 60000,
      validateStatus: () => true,
    });

    if (res.status === 429) {
      console.log('   rate limit: attendo 60s');
      await new Promise(r => setTimeout(r, 60000));
      continue;
    }
    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status}: ${res.data?.message || ''}`);
    }

    const rows: ApiFixture[] = res.data?.data || [];
    out.push(...rows);

    if (!res.data?.pagination?.has_more) break;
    page += 1;
    await new Promise(r => setTimeout(r, 120));
  }

  return out;
}

/** Gol finali: descrizione CURRENT, una riga per squadra. */
function finalGoals(f: ApiFixture): { home: number; away: number } | null {
  const home = f.participants?.find(p => p.meta?.location === 'home');
  const away = f.participants?.find(p => p.meta?.location === 'away');
  if (!home || !away) return null;

  const goalsOf = (teamId: number) =>
    f.scores?.find(s => s.participant_id === teamId && s.description === 'CURRENT')?.score?.goals;

  const h = goalsOf(home.id);
  const a = goalsOf(away.id);
  if (typeof h !== 'number' || typeof a !== 'number') return null;

  return { home: h, away: a };
}

async function upsertTeam(p: NonNullable<ApiFixture['participants']>[number], country: string) {
  const team = await prisma.team.upsert({
    where: { apiId: p.id },
    create: {
      apiId: p.id,
      name: p.name,
      code: p.short_code || null,
      country,
      logo: p.image_path || null,
    },
    update: { name: p.name, logo: p.image_path || null },
  });
  return team.id;
}

async function main() {
  console.log(`\nImport ${FROM} -> ${TO}  leghe: ${LEAGUES.join(', ')}\n`);

  let imported = 0;
  let skipped = 0;
  const perLeague = new Map<string, number>();

  const start = new Date(FROM);
  const end = new Date(TO);

  for (let cursor = new Date(start); cursor < end; ) {
    const windowEnd = new Date(cursor);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);
    const wTo = windowEnd > end ? end : windowEnd;

    const from = cursor.toISOString().slice(0, 10);
    const to = wTo.toISOString().slice(0, 10);

    const rows = await fetchWindow(from, to);
    console.log(`${from} -> ${to}: ${rows.length} partite`);

    for (const f of rows) {
      const goals = finalGoals(f);
      const isFinished = f.state?.short_name === 'FT' || f.state?.developer_name === 'FULL_TIME';

      // Il backtest usa solo partite concluse con risultato noto
      if (!goals || !isFinished) {
        skipped += 1;
        continue;
      }

      const home = f.participants!.find(p => p.meta?.location === 'home')!;
      const away = f.participants!.find(p => p.meta?.location === 'away')!;
      const leagueName = f.league?.name || String(f.league_id);
      const country = String(f.league?.country_id ?? '');

      const homeTeamId = await upsertTeam(home, country);
      const awayTeamId = await upsertTeam(away, country);

      const date = new Date(f.starting_at.replace(' ', 'T') + 'Z');

      const data = {
        date,
        timestamp: Math.floor(date.getTime() / 1000),
        homeTeamId,
        awayTeamId,
        leagueId: f.league_id,
        leagueName,
        leagueCountry: country,
        leagueSeason: f.season_id,
        round: f.round?.name || null,
        status: FixtureStatus.FINISHED,
        venue: f.venue?.name || null,
        homeGoals: goals.home,
        awayGoals: goals.away,
      };

      await prisma.fixture.upsert({
        where: { apiId: f.id },
        create: { apiId: f.id, ...data },
        update: data,
      });

      imported += 1;
      perLeague.set(leagueName, (perLeague.get(leagueName) || 0) + 1);
    }

    cursor = new Date(wTo);
    cursor.setDate(cursor.getDate() + 1);
  }

  console.log(`\nImportate ${imported} partite concluse (scartate ${skipped} non FT o senza risultato)\n`);
  for (const [league, n] of [...perLeague].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${league}`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('\nErrore:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
