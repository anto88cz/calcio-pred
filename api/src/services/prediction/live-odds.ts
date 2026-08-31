/**
 * Lettura delle quote live per i mercati che il modello sa predire.
 *
 * Sta in un modulo condiviso apposta: predict-today e schedina devono leggere
 * le quote nello stesso identico modo. Questo repository ha gia' pagato il
 * prezzo di avere due percorsi di codice divergenti — il backtest misurava un
 * predittore e in produzione ne girava un altro.
 */

/** market_id Sportmonks */
const MARKET_DOUBLE_CHANCE = 2;
const MARKET_BTTS = 14;
const MARKET_OVER_UNDER = 80;

const FULLTIME_MARKETS = new Set(['Fulltime Result', 'Match Winner', '3Way Result', 'Full Time Result']);
const SIDE_OF: Record<string, '1' | 'X' | '2'> = { Home: '1', Draw: 'X', Away: '2' };
const DC_LABELS: Record<string, '1X' | '12' | 'X2'> = {
  'Home/Draw': '1X', 'Draw/Home': '1X',
  'Home/Away': '12', 'Away/Home': '12',
  'Draw/Away': 'X2', 'Away/Draw': 'X2',
};
export const OU_THRESHOLDS = ['1.5', '2.5', '3.5'];

export interface Quote {
  /** miglior prezzo disponibile */
  best: number;
  /** bookmaker che lo offre */
  book: string;
  /** media dei bookmaker: il consenso, non un prezzo ottenibile */
  avg: number;
  /** quanti bookmaker quotano questo esito */
  books: number;
  /** prezzo di ciascun bookmaker, per de-viggare il consenso */
  byBook: Record<string, number>;
}

/**
 * Chiave dell'esito, nella forma "mercato:esito".
 * Esempi: "1X2:1", "DC:1X", "GG:NG", "OU2.5:Over".
 */
function keyOf(row: any): string | null {
  if (FULLTIME_MARKETS.has(row.market_description)) {
    const side = SIDE_OF[row.label];
    return side ? `1X2:${side}` : null;
  }
  if (row.market_id === MARKET_DOUBLE_CHANCE) {
    // Un bookmaker etichetta con i nomi delle squadre ("Verona or Draw"): non
    // lo interpretiamo, perche' sbagliare lato inverte l'esito e il prezzo
    // migliore lo troviamo comunque fra gli altri venti.
    const dc = DC_LABELS[row.label];
    return dc ? `DC:${dc}` : null;
  }
  if (row.market_id === MARKET_BTTS && (row.label === 'Yes' || row.label === 'No')) {
    return `GG:${row.label === 'Yes' ? 'GG' : 'NG'}`;
  }
  if (row.market_id === MARKET_OVER_UNDER && (row.label === 'Over' || row.label === 'Under')) {
    const t = parseFloat(String(row.total ?? '').replace(',', '.'));
    return OU_THRESHOLDS.includes(String(t)) ? `OU${t}:${row.label}` : null;
  }
  return null;
}

function parseUpdate(row: any): number {
  const raw = row?.latest_bookmaker_update || row?.created_at;
  if (!raw) return 0;
  const ts = Date.parse(String(raw).replace(' ', 'T') + 'Z');
  return Number.isNaN(ts) ? 0 : ts;
}

/**
 * Per ogni esito, l'ultima quota di ciascun bookmaker, con media e massimo.
 *
 * @param kickoff se indicato, si scartano le quote aggiornate dopo il fischio
 *   d'inizio: su una partita gia' giocata sarebbero quote in-play.
 */
export function extractOdds(rows: any[], kickoff?: Date): Record<string, Quote> {
  const kickoffTs = kickoff ? kickoff.getTime() : Infinity;
  const latest = new Map<string, { value: number; ts: number; book: string }>();

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const ts = parseUpdate(row);
    if (ts >= kickoffTs) continue;
    const value = parseFloat(row.value ?? row.dp3 ?? '0');
    if (!(value > 1)) continue;
    const k = `${key}|${row.bookmaker_id}`;
    const prev = latest.get(k);
    if (!prev || ts > prev.ts) latest.set(k, { value, ts, book: String(row.bookmaker_id) });
  }

  const grouped: Record<string, Array<{ book: string; value: number }>> = {};
  for (const [k, v] of latest) {
    const key = k.split('|')[0];
    (grouped[key] = grouped[key] || []).push({ book: v.book, value: v.value });
  }

  const out: Record<string, Quote> = {};
  for (const [key, values] of Object.entries(grouped)) {
    const top = values.reduce((a, b) => (a.value >= b.value ? a : b));
    out[key] = {
      best: top.value,
      book: top.book,
      avg: values.reduce((s, v) => s + v.value, 0) / values.length,
      books: values.length,
      byBook: Object.fromEntries(values.map(v => [v.book, v.value])),
    };
  }
  return out;
}

export interface Candidate {
  /** etichetta leggibile: "1", "Under 2.5", "Doppia 1X", "No goal" */
  label: string;
  /** chiave nelle quote */
  key: string;
  /** famiglia di mercato, per raggruppare */
  family: 'segno' | 'doppia' | 'goal/nogoal' | 'over/under';
  modelProb: number;
}

/** Tutti i lati giocabili di una partita, con la probabilita' del modello. */
export function candidatesFrom(p: {
  prob1: number; probX: number; prob2: number;
  dc1X: number; dc12: number; dcX2: number;
  bttsYes: number; bttsNo: number;
  over: Record<string, number>; under: Record<string, number>;
}): Candidate[] {
  const out: Candidate[] = [
    { label: '1', key: '1X2:1', family: 'segno', modelProb: p.prob1 },
    { label: 'X', key: '1X2:X', family: 'segno', modelProb: p.probX },
    { label: '2', key: '1X2:2', family: 'segno', modelProb: p.prob2 },
    { label: 'Doppia 1X', key: 'DC:1X', family: 'doppia', modelProb: p.dc1X },
    { label: 'Doppia 12', key: 'DC:12', family: 'doppia', modelProb: p.dc12 },
    { label: 'Doppia X2', key: 'DC:X2', family: 'doppia', modelProb: p.dcX2 },
    { label: 'Goal', key: 'GG:GG', family: 'goal/nogoal', modelProb: p.bttsYes },
    { label: 'No goal', key: 'GG:NG', family: 'goal/nogoal', modelProb: p.bttsNo },
  ];
  for (const t of OU_THRESHOLDS) {
    out.push({ label: `Over ${t}`, key: `OU${t}:Over`, family: 'over/under', modelProb: p.over[t] });
    out.push({ label: `Under ${t}`, key: `OU${t}:Under`, family: 'over/under', modelProb: p.under[t] });
  }
  return out;
}

/** Mediana, robusta agli errori del feed. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * La famiglia di esiti a cui una chiave appartiene, con la somma delle
 * probabilita' vere.
 *
 * Serve per de-viggare: il margine si toglie normalizzando su TUTTI gli esiti
 * del mercato, non su uno solo. Per la doppia chance la somma e' 2, non 1:
 * ogni esito elementare (1, X, 2) compare in due delle tre doppie.
 */
interface Family { outcomes: string[]; target: number }

export function familyOf(key: string): Family | null {
  const prefix = key.split(':')[0];
  if (prefix === '1X2') return { outcomes: ['1X2:1', '1X2:X', '1X2:2'], target: 1 };
  if (prefix === 'DC') return { outcomes: ['DC:1X', 'DC:12', 'DC:X2'], target: 2 };
  if (prefix === 'GG') return { outcomes: ['GG:GG', 'GG:NG'], target: 1 };
  if (prefix.startsWith('OU')) return { outcomes: [`${prefix}:Over`, `${prefix}:Under`], target: 1 };
  return null;
}

export interface Consensus {
  /** probabilita' de-viggata: mediana degli ALTRI bookmaker */
  prob: number;
  /** quanti bookmaker concorrono al consenso */
  books: number;
  /** margine del banco sulla famiglia, alle quote di consenso */
  overround: number;
  /** quanto il prezzo migliore paga sopra la quota equa: best * prob - 1 */
  deviation: number;
}

/**
 * Il consenso del mercato su un esito, de-viggato, escluso il bookmaker su cui
 * si punterebbe.
 *
 * L'esclusione non e' un dettaglio: se il book anomalo entra nel proprio
 * consenso se lo trascina dietro, e lo scarto misurato risulta piu' piccolo di
 * quello che e'. La mediana perche' fra venti feed qualche prezzo e' sbagliato.
 *
 * Contano solo i bookmaker che quotano TUTTI gli esiti della famiglia: senza
 * l'insieme completo il margine non e' calcolabile e la normalizzazione
 * darebbe un numero senza significato.
 */
export function consensusOf(
  quotes: Record<string, Quote>,
  key: string,
  excludeBook?: string,
  minBooks = 4,
): Consensus | null {
  const fam = familyOf(key);
  if (!fam) return null;
  const idx = fam.outcomes.indexOf(key);
  if (idx < 0) return null;

  const rows = fam.outcomes.map(k => quotes[k]);
  if (rows.some(r => !r)) return null;

  const complete = Object.keys(rows[0].byBook)
    .filter(b => rows.every(r => r.byBook[b] > 1));
  const others = complete.filter(b => b !== excludeBook);
  if (others.length < minBooks) return null;

  const probs = others.map(b => {
    const raw = rows.map(r => 1 / r.byBook[b]);
    const sum = raw.reduce((a, c) => a + c, 0);
    return (raw[idx] / sum) * fam.target;
  });
  const prob = median(probs);
  if (!(prob > 0.001 && prob < 0.999)) return null;

  // Margine del banco: quanto la somma delle probabilita' implicite eccede il
  // totale che dovrebbero fare. Calcolato sulle quote medie, che sono il
  // prezzo tipico offerto, non sul massimo.
  const overround = rows.reduce((a, r) => a + 1 / r.avg, 0) / fam.target - 1;

  return { prob, books: others.length, overround, deviation: quotes[key].best * prob - 1 };
}

/**
 * Come si sceglie la giocata di una partita.
 *
 *   prezzo   lo scarto fra il miglior prezzo e la quota equa secondo gli altri
 *            bookmaker. Cerca il book rimasto indietro. Non usa il modello, e
 *            finisce quasi sempre sugli outsider, dove i book sono piu' in
 *            disaccordo.
 *   sicure   la probabilita' piu' alta secondo il MERCATO. Serve a giocare
 *            poche partite ad alta probabilita'. Alta probabilita' non vuol
 *            dire redditizia: a quota 1.40 servono il 71.4% di vincenti solo
 *            per pareggiare.
 *   ev       il valore atteso secondo il modello. Massimizzarlo significa
 *            cercare la partita dove il modello diverge di piu' dal mercato,
 *            cioe' dove piu' probabilmente sbaglia, visto che il mercato lo
 *            batte in log-loss.
 *   prob     la probabilita' piu' alta secondo il MODELLO. Come sopra, con in
 *            piu' il difetto di preferire sistematicamente le quote basse.
 */
export type Criterio = 'prezzo' | 'sicure' | 'ev' | 'prob';

export interface PickFilters {
  /** quanti bookmaker devono quotare l'esito */
  minBooks?: number;
  /** quota minima: sotto, la giocata non vale il rischio di stake */
  minOdds?: number;
  /** quota massima: sopra l'8 il favourite-longshot bias rende -17.86% +/-7.53 */
  maxOdds?: number;
  /** scarto minimo dal prezzo equo */
  minDeviation?: number;
  /** oltre questo scarto la quota e' un errore del feed, non un'occasione */
  maxDeviation?: number;
  /** probabilita' minima secondo il consenso di mercato */
  minProb?: number;
}

/**
 * Una giocata possibile su una partita, con tutto quello che serve per
 * sceglierla e per rivederla dopo.
 *
 * E' una struttura piatta e serializzabile apposta: le giornate gia' giocate
 * si esportano in JSON una volta sola — il costo vero e' ristimare il modello
 * ogni giorno — e poi si possono riprovare strategie diverse sugli stessi dati
 * senza rifare il calcolo.
 */
export interface CandidateRow {
  key: string;
  label: string;
  family: Candidate['family'];
  modelProb: number;
  /** miglior prezzo e chi lo offre */
  best: number;
  book: string;
  /** media dei bookmaker: il consenso, non un prezzo ottenibile */
  avg: number;
  books: number;
  /** probabilita' de-viggata degli ALTRI bookmaker */
  consensusProb: number;
  consensusBooks: number;
  /** margine del banco sulla famiglia di mercato */
  overround: number;
  /** quanto il miglior prezzo paga sopra la quota equa */
  deviation: number;
}

/** Tutte le giocate quotate di una partita, con il consenso di mercato. */
export function buildCandidates(
  quotes: Record<string, Quote>,
  probs: Parameters<typeof candidatesFrom>[0],
  minBooks = 5,
): CandidateRow[] {
  const out: CandidateRow[] = [];
  for (const c of candidatesFrom(probs)) {
    const q = quotes[c.key];
    if (!q || q.books < minBooks) continue;
    // Il consenso esclude il bookmaker che offre il prezzo migliore: e'
    // proprio quello che stiamo giudicando, non puo' fare parte della giuria.
    const k = consensusOf(quotes, c.key, q.book);
    if (!k) continue;
    out.push({
      key: c.key, label: c.label, family: c.family, modelProb: c.modelProb,
      best: q.best, book: q.book, avg: q.avg, books: q.books,
      consensusProb: k.prob, consensusBooks: k.books,
      overround: k.overround, deviation: k.deviation,
    });
  }
  return out;
}

/** Il valore su cui si ordina, secondo il criterio scelto. */
export function score(r: CandidateRow, criterio: Criterio): number {
  if (criterio === 'sicure') return r.consensusProb;
  if (criterio === 'prob') return r.modelProb;
  if (criterio === 'ev') return r.modelProb * r.best - 1;
  return r.deviation;
}

/** Le giocate che superano i filtri. */
export function filterCandidates(rows: CandidateRow[], f: PickFilters = {}): CandidateRow[] {
  const minOdds = f.minOdds ?? 1.4;
  const maxOdds = f.maxOdds ?? 8;
  const minDeviation = f.minDeviation ?? -Infinity;
  const maxDeviation = f.maxDeviation ?? 0.15;
  const minProb = f.minProb ?? 0;
  const minBooks = f.minBooks ?? 0;
  return rows.filter(r =>
    r.books >= minBooks &&
    r.best >= minOdds && r.best <= maxOdds &&
    r.deviation >= minDeviation && r.deviation <= maxDeviation &&
    r.consensusProb >= minProb);
}

/**
 * La giocata di una partita, o null se nessuna supera i filtri.
 *
 * Sta qui, e non nei singoli script, perche' schedina, verifica-giornata e la
 * simulazione storica devono scegliere nello stesso identico modo. Il peccato
 * originale di questo repository e' stato misurare un predittore e mandarne in
 * produzione un altro: due copie di questa funzione lo ripeterebbero sulla
 * selezione invece che sul modello.
 */
export function selectPick(
  rows: CandidateRow[],
  criterio: Criterio,
  f: PickFilters = {},
): CandidateRow | null {
  const playable = filterCandidates(rows, f);
  if (!playable.length) return null;
  return playable.reduce((x, y) => (score(y, criterio) > score(x, criterio) ? y : x));
}
