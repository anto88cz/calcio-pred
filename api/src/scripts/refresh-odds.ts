/**
 * Arricchisce i report di backtest con la quota MIGLIORE disponibile, non solo
 * con la media dei bookmaker.
 *
 * Perche' e' decisivo: nessuno scommette alla media del mercato. Si scommette
 * al prezzo migliore che si trova, e la differenza non e' un dettaglio. Su un
 * campione di partite il margine del banco misurato sulla media dei 20
 * bookmaker e' del 6.06%; misurato sulla quota migliore per ciascun esito
 * scende allo 0.11%, e su alcune partite diventa negativo (arbitraggio fra
 * book). Un modello che deve recuperare lo 0.1% e non il 6% ha un problema
 * completamente diverso davanti.
 *
 * Si registra anche quanto prima del fischio d'inizio i bookmaker hanno smesso
 * di aggiornare: serve a sapere se quella che chiamiamo "closing line" e'
 * davvero la linea di chiusura o una fotografia di diverse ore prima.
 *
 * Usa /fixtures/multi/{ids} con filters=markets:1 (solo 1X2): 25 partite per
 * chiamata invece di una, cioe' un paio di minuti invece di quaranta.
 *
 * Uso:
 *   npx tsx src/scripts/refresh-odds.ts backtest-full-2025-26.json backtest-dc-blend.json
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';

const prisma = new PrismaClient();

const FULLTIME_MARKETS = new Set(['Fulltime Result', 'Match Winner', '3Way Result', 'Full Time Result']);
const LABELS: Record<string, 'home' | 'draw' | 'away'> = { Home: 'home', Draw: 'draw', Away: 'away' };

/** market_id Sportmonks dei mercati che servono. */
const MARKET_1X2 = 1;
const MARKET_DOUBLE_CHANCE = 2;
const MARKET_BTTS = 14;
const MARKET_OVER_UNDER = 80;
const MARKETS = [MARKET_1X2, MARKET_DOUBLE_CHANCE, MARKET_BTTS, MARKET_OVER_UNDER];

/**
 * Doppia chance: quasi tutti i bookmaker etichettano Home/Draw, Home/Away,
 * Draw/Away. Uno solo usa i nomi delle squadre ("Verona or Draw"), e non lo
 * interpretiamo: indovinare quale lato sia la squadra di casa rischia di
 * invertire l'esito, e prendendo comunque il prezzo migliore fra una ventina
 * di bookmaker perderne uno non cambia niente.
 */
const DC_LABELS: Record<string, '1X' | '12' | 'X2'> = {
  'Home/Draw': '1X', 'Draw/Home': '1X',
  'Home/Away': '12', 'Away/Home': '12',
  'Draw/Away': 'X2', 'Away/Draw': 'X2',
};

const OU_THRESHOLDS = ['1.5', '2.5', '3.5'];

/** Prezzi di un esito: media dei bookmaker e miglior prezzo disponibile. */
interface Price { avg: number; best: number; books: number }

interface EnrichedOdds {
  /** media dei bookmaker: e' il consenso, non un prezzo ottenibile */
  home: number; draw: number; away: number;
  /** miglior prezzo disponibile per ciascun esito: e' quello che si incassa */
  best: { home: number; draw: number; away: number };
  bookmakers: number;
  overround: number;
  overroundBest: number;
  /** ore fra l'ultimo aggiornamento mediano e il fischio d'inizio */
  medianLagHours: number;
  /** doppia chance: 1X, 12, X2 */
  dc?: Partial<Record<'1X' | '12' | 'X2', Price>>;
  /** entrambe le squadre segnano */
  btts?: { yes?: Price; no?: Price };
  /** over/under, per soglia */
  ou?: Record<string, { over?: Price; under?: Price }>;
}

function parseUpdate(row: any): number | null {
  const raw = row?.latest_bookmaker_update || row?.created_at;
  if (!raw) return null;
  const ts = Date.parse(String(raw).replace(' ', 'T') + 'Z');
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Per ogni chiave di esito prende l'ultima quota pre-partita di ciascun
 * bookmaker, e ne restituisce media e massimo.
 */
function collect(
  rows: any[], kickoffTs: number,
  keyOf: (row: any) => string | null
): Record<string, Price> {
  const latest = new Map<string, { value: number; ts: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const ts = parseUpdate(row);
    if (ts === null || ts >= kickoffTs) continue;
    const value = parseFloat(row.value ?? row.dp3 ?? '0');
    if (!(value > 1)) continue;
    const k = `${key}|${row.bookmaker_id}`;
    const prev = latest.get(k);
    if (!prev || ts > prev.ts) latest.set(k, { value, ts });
  }

  const grouped: Record<string, number[]> = {};
  for (const [k, { value }] of latest) {
    const key = k.split('|')[0];
    (grouped[key] = grouped[key] || []).push(value);
  }

  const out: Record<string, Price> = {};
  for (const [key, values] of Object.entries(grouped)) {
    out[key] = {
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000,
      best: Math.max(...values),
      books: values.length,
    };
  }
  return out;
}

/** "2.50", "2,5", "2.5" -> "2.5" */
function normalizeTotal(total: any): string | null {
  const n = parseFloat(String(total ?? '').replace(',', '.'));
  return Number.isFinite(n) ? String(n) : null;
}

function buildExtraMarkets(rows: any[], kickoffTs: number) {
  const dcRaw = collect(rows, kickoffTs, row =>
    row.market_id === MARKET_DOUBLE_CHANCE ? (DC_LABELS[row.label] ?? null) : null);

  const bttsRaw = collect(rows, kickoffTs, row =>
    row.market_id === MARKET_BTTS && (row.label === 'Yes' || row.label === 'No')
      ? String(row.label).toLowerCase() : null);

  const ouRaw = collect(rows, kickoffTs, row => {
    if (row.market_id !== MARKET_OVER_UNDER) return null;
    if (row.label !== 'Over' && row.label !== 'Under') return null;
    const t = normalizeTotal(row.total);
    return t && OU_THRESHOLDS.includes(t) ? `${t}:${String(row.label).toLowerCase()}` : null;
  });

  const ou: Record<string, { over?: Price; under?: Price }> = {};
  for (const [key, price] of Object.entries(ouRaw)) {
    const [threshold, side] = key.split(':');
    ou[threshold] = ou[threshold] || {};
    (ou[threshold] as any)[side] = price;
  }

  return {
    dc: Object.keys(dcRaw).length ? (dcRaw as Partial<Record<'1X' | '12' | 'X2', Price>>) : undefined,
    btts: bttsRaw.yes || bttsRaw.no ? { yes: bttsRaw.yes, no: bttsRaw.no } : undefined,
    ou: Object.keys(ou).length ? ou : undefined,
  };
}

function buildOdds(rows: any[], kickoff: Date): EnrichedOdds | null {
  const kickoffTs = kickoff.getTime();
  const latest = new Map<string, { value: number; ts: number }>();

  for (const row of rows) {
    if (!FULLTIME_MARKETS.has(row.market_description)) continue;
    const outcome = LABELS[row.label];
    if (!outcome) continue;
    const ts = parseUpdate(row);
    if (ts === null || ts >= kickoffTs) continue; // mai quote in-play
    const value = parseFloat(row.value ?? row.dp3 ?? '0');
    if (!(value > 1)) continue;
    const key = `${row.bookmaker_id}:${outcome}`;
    const prev = latest.get(key);
    if (!prev || ts > prev.ts) latest.set(key, { value, ts });
  }

  const buckets: Record<string, number[]> = { home: [], draw: [], away: [] };
  const books = new Set<string>();
  const lags: number[] = [];

  for (const [key, { value, ts }] of latest) {
    const [bookmakerId, outcome] = key.split(':');
    buckets[outcome].push(value);
    books.add(bookmakerId);
    lags.push((kickoffTs - ts) / 3_600_000);
  }

  if (!buckets.home.length || !buckets.draw.length || !buckets.away.length) return null;

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const home = avg(buckets.home), draw = avg(buckets.draw), away = avg(buckets.away);
  const best = {
    home: Math.max(...buckets.home),
    draw: Math.max(...buckets.draw),
    away: Math.max(...buckets.away),
  };
  if (!(home > 1) || !(draw > 1) || !(away > 1)) return null;

  lags.sort((a, b) => a - b);

  return {
    home, draw, away, best,
    bookmakers: books.size,
    overround: 1 / home + 1 / draw + 1 / away,
    overroundBest: 1 / best.home + 1 / best.draw + 1 / best.away,
    medianLagHours: lags[Math.floor(lags.length / 2)],
    ...buildExtraMarkets(rows, kickoffTs),
  };
}

async function main() {
  const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('Indicare almeno un report JSON.');
    process.exit(1);
  }

  // id Postgres -> apiId Sportmonks, piu' data di inizio
  const fixtures = await prisma.fixture.findMany({ select: { id: true, apiId: true, date: true } });
  const byId = new Map(fixtures.map(f => [f.id, f]));

  const needed = new Set<number>();
  const reports = files.map(file => {
    const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
    const report = JSON.parse(fs.readFileSync(full, 'utf-8'));
    for (const r of report.results) if (byId.has(r.fixtureId)) needed.add(r.fixtureId);
    return { full, report };
  });

  console.log(`Report da arricchire: ${files.length}`);
  console.log(`Partite da interrogare: ${needed.size}  (${Math.ceil(needed.size / 25)} chiamate)\n`);

  const client = getSportsmonksClient();
  const oddsByFixture = new Map<number, EnrichedOdds>();
  const ids = [...needed];

  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const apiIds = chunk.map(id => byId.get(id)!.apiId).join(',');
    try {
      const response: any = await client.get(`/fixtures/multi/${apiIds}`, {
        include: 'odds',
        filters: `markets:${MARKETS.join(',')}`,
      });
      const arr: any[] = response?.data || [];
      const byApi = new Map<number, any>(arr.map(x => [x.id, x]));
      for (const id of chunk) {
        const f = byId.get(id)!;
        const data = byApi.get(f.apiId);
        const built = data ? buildOdds(data.odds || [], f.date) : null;
        if (built) oddsByFixture.set(id, built);
      }
    } catch (error: any) {
      console.error(`  blocco ${i}: ${error.message}`);
    }
    const done = Math.min(i + 25, ids.length);
    if (done % 250 === 0 || done === ids.length) console.log(`  ${done}/${ids.length}  risolte ${oddsByFixture.size}`);
  }

  const all = [...oddsByFixture.values()];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log('\n--- COSA CAMBIA ---');
  console.log(`  margine sulla quota media:    ${((mean(all.map(o => o.overround)) - 1) * 100).toFixed(2)}%`);
  console.log(`  margine sulla quota migliore: ${((mean(all.map(o => o.overroundBest)) - 1) * 100).toFixed(2)}%`);
  console.log(`  partite con margine negativo sulla migliore: ${all.filter(o => o.overroundBest < 1).length}/${all.length}`);
  console.log(`  ultimo aggiornamento mediano: ${mean(all.map(o => o.medianLagHours)).toFixed(1)} ore prima del fischio`);
  console.log('');
  console.log('--- COPERTURA PER MERCATO ---');
  const cover = (n: number) => `${n}/${all.length} (${((n / all.length) * 100).toFixed(0)}%)`;
  console.log(`  1X2:              ${cover(all.length)}`);
  console.log(`  doppia chance:    ${cover(all.filter(o => o.dc && o.dc['1X'] && o.dc['12'] && o.dc['X2']).length)}`);
  console.log(`  entrambe segnano: ${cover(all.filter(o => o.btts?.yes && o.btts?.no).length)}`);
  for (const t of OU_THRESHOLDS) {
    console.log(`  over/under ${t}:     ${cover(all.filter(o => o.ou?.[t]?.over && o.ou?.[t]?.under).length)}`);
  }

  for (const { full, report } of reports) {
    let patched = 0;
    for (const r of report.results) {
      const o = oddsByFixture.get(r.fixtureId);
      if (o) { r.closingOdds = o; patched++; }
    }
    fs.writeFileSync(full, JSON.stringify(report, null, 2));
    console.log(`\n${path.basename(full)}: aggiornate ${patched}/${report.results.length} partite`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('Errore:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
