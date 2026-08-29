/**
 * Quote di chiusura pre-match, per il backtest.
 *
 * Perche' non si riusa fetchOddsByFixtureId: quella media TUTTE le righe del
 * mercato, comprese quelle aggiornate a partita iniziata. In un backtest e'
 * look-ahead: una quota mossa al 60' incorpora il risultato. Qui si tiene solo
 * cio' che il bookmaker aveva pubblicato PRIMA del calcio d'inizio, e per ogni
 * bookmaker si prende la sua riga piu' recente entro quel limite (la
 * "closing line", che e' il riferimento standard per valutare un modello).
 */

import { getSportsmonksClient } from '../sportsmonks/client';
import { redis } from '../../lib/redis';
import logger from '../../utils/logger';

export interface ClosingOdds1X2 {
  home: number;
  draw: number;
  away: number;
  bookmakers: number;
  /** somma delle probabilita' implicite: > 1, l'eccesso e' il margine del banco */
  overround: number;
}

const FULLTIME_MARKETS = new Set([
  'Fulltime Result',
  'Match Winner',
  '3Way Result',
]);

const LABELS = { Home: 'home', Draw: 'draw', Away: 'away' } as const;

function parseUpdate(row: any): number | null {
  const raw = row?.latest_bookmaker_update || row?.created_at;
  if (!raw) return null;
  const ts = Date.parse(String(raw).replace(' ', 'T') + 'Z');
  return Number.isNaN(ts) ? null : ts;
}

/**
 * @param fixtureId  fixture Sportmonks
 * @param kickoff    orario di inizio: si scartano le quote aggiornate dopo
 */
export async function fetchClosingOdds1X2(
  fixtureId: number,
  kickoff: Date
): Promise<ClosingOdds1X2 | null> {
  const cacheKey = `backtest:closing-odds:${fixtureId}`;

  try {
    const cached = await redis?.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // cache non disponibile: si prosegue con la chiamata
  }

  try {
    const client = getSportsmonksClient();
    const response = await client.get<any>(`/fixtures/${fixtureId}`, { include: 'odds' });

    const rows: any[] = response?.data?.odds || [];
    if (rows.length === 0) return null;

    const kickoffTs = kickoff.getTime();

    // Ultima quota per (bookmaker, esito) pubblicata prima del fischio d'inizio
    const latest = new Map<string, { value: number; ts: number }>();

    for (const row of rows) {
      if (!FULLTIME_MARKETS.has(row.market_description)) continue;

      const outcome = LABELS[row.label as keyof typeof LABELS];
      if (!outcome) continue;

      const ts = parseUpdate(row);
      if (ts === null || ts >= kickoffTs) continue; // niente quote in-play

      const value = parseFloat(row.value ?? row.dp3 ?? '0');
      if (!(value > 1)) continue;

      const key = `${row.bookmaker_id}:${outcome}`;
      const prev = latest.get(key);
      if (!prev || ts > prev.ts) latest.set(key, { value, ts });
    }

    const buckets: Record<string, number[]> = { home: [], draw: [], away: [] };
    const bookmakers = new Set<string>();

    for (const [key, { value }] of latest) {
      const [bookmakerId, outcome] = key.split(':');
      buckets[outcome].push(value);
      bookmakers.add(bookmakerId);
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const home = avg(buckets.home);
    const draw = avg(buckets.draw);
    const away = avg(buckets.away);

    if (!(home > 1) || !(draw > 1) || !(away > 1)) return null;

    const result: ClosingOdds1X2 = {
      home,
      draw,
      away,
      bookmakers: bookmakers.size,
      overround: 1 / home + 1 / draw + 1 / away,
    };

    try {
      // Le quote di una partita conclusa non cambiano piu': cache lunga.
      await redis?.setex(cacheKey, 60 * 60 * 24 * 30, JSON.stringify(result));
    } catch {
      // ignorabile
    }

    return result;
  } catch (error: any) {
    logger.warn({ fixtureId, err: error.message }, 'Closing odds non recuperate');
    return null;
  }
}
