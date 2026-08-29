/**
 * Verifica cosa copre davvero la tua chiave Sportmonks.
 *
 * Uso:  cd api && npx tsx src/scripts/check-sportmonks-access.ts
 * (legge SPORTSMONKS_API_KEY da .env)
 *
 * Interroga gli endpoint /my/* dell'account e poi prova UNO A UNO tutti gli
 * endpoint + include che il progetto usa davvero, dicendo per ciascuno se e'
 * incluso nel piano, se e' a pagamento a parte, o se semplicemente non ha dati.
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const API_KEY = process.env.SPORTSMONKS_API_KEY;
const FOOTBALL = process.env.SPORTSMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football';
const CORE = FOOTBALL.replace(/\/football\/?$/, '');

if (!API_KEY) {
  console.error('SPORTSMONKS_API_KEY non impostata. Mettila in api/.env');
  process.exit(1);
}

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const ko = (s: string) => `\x1b[31m${s}\x1b[0m`;
const warn = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

type Probe = {
  label: string;
  usedBy: string;
  url: string;
  params?: Record<string, string | number>;
  /** cosa deve esserci nella risposta perche' la feature sia davvero utilizzabile */
  requires?: (data: any) => boolean;
  requiresLabel?: string;
  addon?: string;
};

type Outcome = 'OK' | 'EMPTY' | 'NO_ACCESS' | 'ERROR';
const results: Array<{ probe: Probe; outcome: Outcome; detail: string }> = [];

async function call(url: string, params: Record<string, any> = {}) {
  return axios.get(url, {
    params: { ...params, api_token: API_KEY },
    timeout: 30000,
    validateStatus: () => true,
  });
}

async function probe(p: Probe): Promise<void> {
  const res = await call(p.url, p.params);
  const body = res.data;

  if (res.status === 403 || res.status === 401) {
    const msg: string = body?.message || '';
    results.push({ probe: p, outcome: 'NO_ACCESS', detail: msg.slice(0, 140) || `HTTP ${res.status}` });
    return;
  }
  if (res.status >= 400) {
    results.push({ probe: p, outcome: 'ERROR', detail: (body?.message || `HTTP ${res.status}`).slice(0, 140) });
    return;
  }

  const data = body?.data;
  const empty = data == null || (Array.isArray(data) && data.length === 0);
  if (empty) {
    results.push({ probe: p, outcome: 'EMPTY', detail: 'risposta 200 ma nessun dato nel periodo/fixture di test' });
    return;
  }
  if (p.requires && !p.requires(data)) {
    results.push({ probe: p, outcome: 'EMPTY', detail: `manca: ${p.requiresLabel}` });
    return;
  }
  const n = Array.isArray(data) ? data.length : 1;
  results.push({ probe: p, outcome: 'OK', detail: `${n} record` });
}

function line(outcome: Outcome, label: string, detail: string, usedBy: string) {
  const tag = outcome === 'OK' ? ok('  OK      ')
    : outcome === 'EMPTY' ? warn('  VUOTO   ')
    : outcome === 'NO_ACCESS' ? ko('  NEGATO  ')
    : ko('  ERRORE  ');
  console.log(`${tag}${label.padEnd(34)} ${detail}`);
  console.log(`          ${dim(usedBy)}`);
}

// ---------------------------------------------------------------- account
async function account() {
  console.log('\n═══ 1. Cosa dice il tuo account ═══\n');

  for (const [name, path] of [
    ['Piano / risorse', '/my/resources'],
    ['Add-on attivi', '/my/enrichments'],
    ['Leghe nel piano', '/my/leagues'],
    ['Consumo chiamate', '/my/usage'],
  ] as const) {
    const res = await call(`${CORE}${path}`, { per_page: 200 });
    if (res.status >= 400) {
      console.log(`${warn('  ?')} ${name.padEnd(20)} HTTP ${res.status} ${dim(path)}`);
      continue;
    }
    const d = res.data?.data;
    if (path === '/my/leagues' && Array.isArray(d)) {
      console.log(`${ok('  ✓')} ${name.padEnd(20)} ${d.length} leghe`);
      const names = d.map((l: any) => `${l.id} ${l.name}`);
      console.log(dim('      ' + names.join(' · ')));
    } else if (Array.isArray(d)) {
      console.log(`${ok('  ✓')} ${name.padEnd(20)} ${d.length} voci`);
      console.log(dim('      ' + d.map((x: any) => x.name || x.plan || JSON.stringify(x)).join(' · ').slice(0, 600)));
    } else if (d) {
      console.log(`${ok('  ✓')} ${name.padEnd(20)} ${JSON.stringify(d).slice(0, 400)}`);
    }
  }
}

// ---------------------------------------------------------------- leghe
const CORE_LEAGUES: Array<[number, string]> = [
  [8, 'Premier League'], [9, 'Championship'], [12, 'League One'], [14, 'League Two'],
  [384, 'Serie A'], [387, 'Serie B'],
  [564, 'La Liga'], [567, 'La Liga 2'], [570, 'Copa Del Rey'],
  [82, 'Bundesliga'], [85, '2. Bundesliga'],
  [301, 'Ligue 1'], [304, 'Ligue 2'],
  [72, 'Eredivisie'], [74, 'Eerste Divisie'],
  [462, 'Liga Portugal'], [465, 'Liga Portugal 2'],
  [600, 'Super Lig'], [603, '1. Lig'],
  [208, 'Pro League'], [271, 'Superliga'],
];

async function leagues() {
  console.log('\n═══ 2. Leghe richieste dal codice (ALLOWED_LEAGUES) ═══\n');
  const missing: string[] = [];
  for (const [id, name] of CORE_LEAGUES) {
    const res = await call(`${FOOTBALL}/leagues/${id}`);
    const good = res.status === 200 && res.data?.data;
    console.log(`${good ? ok('  OK    ') : ko('  NEGATO')} ${String(id).padEnd(5)} ${name}`);
    if (!good) missing.push(`${id} ${name}`);
  }
  return missing;
}

// ---------------------------------------------------------------- funzionalita'
async function features() {
  console.log('\n═══ 3. Endpoint e include usati dal progetto ═══\n');

  // fixture recente di Premier League su cui provare gli include
  const today = new Date();
  const from = new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const to = new Date(today.getTime() - 1 * 864e5).toISOString().slice(0, 10);

  // finestra di 30 giorni a circa un anno fa, per misurare la profondita' storica
  const old365 = new Date(today.getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const old335 = new Date(today.getTime() - 335 * 864e5).toISOString().slice(0, 10);

  let sampleFixtureId: number | null = null;
  const sample = await call(`${FOOTBALL}/fixtures/between/${from}/${to}`, {
    include: 'participants;scores;state;season',
    per_page: 50,
  });
  if (sample.status === 200 && Array.isArray(sample.data?.data)) {
    const fin = sample.data.data.find((f: any) => f.state?.short === 'FT') || sample.data.data[0];
    sampleFixtureId = fin?.id ?? null;
  }

  const probes: Probe[] = [
    {
      label: 'fixtures/between + include',
      usedBy: 'statistics.ts getTeamHistory — storico squadre, base di tutto',
      url: `${FOOTBALL}/fixtures/between/${from}/${to}`,
      params: { include: 'participants;scores;state;season', per_page: 50 },
    },
    {
      label: 'storico 12 mesi indietro  ⭐',
      usedBy: 'statistics.ts:309 — il modello guarda 12 mesi indietro; alcuni piani limitano la profondita\' storica',
      addon: 'Historical data (profondita\' dello storico nel piano)',
      url: `${FOOTBALL}/fixtures/between/${old365}/${old335}`,
      params: { include: 'participants;scores;state', per_page: 50 },
    },
    {
      label: 'fixtures/head-to-head',
      usedBy: 'statistics.ts getHeadToHead — fattore H2H',
      url: `${FOOTBALL}/fixtures/head-to-head/8/9`,
      params: { include: 'participants;scores' },
    },
    {
      label: 'teams/{id} + include',
      usedBy: 'teams.ts — anagrafica squadre',
      url: `${FOOTBALL}/teams/8`,
      params: { include: 'country;venue' },
    },
    {
      label: 'teams/search/{nome}',
      usedBy: 'team-mapping.ts — mapping nome → ID',
      url: `${FOOTBALL}/teams/search/Liverpool`,
    },
  ];

  if (sampleFixtureId) {
    probes.push(
      {
        label: 'include: statistics  ⭐',
        usedBy: 'statistics.ts getFixtureStatistics — tiri, e campo "Expected Goals"',
        addon: 'Statistics / Advanced Statistics',
        url: `${FOOTBALL}/fixtures/${sampleFixtureId}`,
        params: { include: 'statistics.type;participants' },
        requires: (d: any) => Array.isArray(d?.statistics) && d.statistics.length > 0,
        requiresLabel: 'array statistics popolato',
      },
      {
        label: 'xG dentro statistics  ⭐',
        usedBy: 'statistics.ts:140 getStatValue(..., "Expected Goals") — calibrazione lambda',
        addon: 'xG / Expected Goals',
        url: `${FOOTBALL}/fixtures/${sampleFixtureId}`,
        params: { include: 'statistics.type' },
        requires: (d: any) =>
          Array.isArray(d?.statistics) &&
          d.statistics.some((s: any) =>
            /expected/i.test(s?.type?.name || s?.type?.developer_name || '')),
        requiresLabel: 'nessuna statistica "Expected Goals" nel set restituito',
      },
      {
        label: 'include: xGFixture  ⭐',
        usedBy: 'data-fetcher.service.ts:284 — xG per il predittore delle giocate',
        addon: 'xG / Expected Goals',
        url: `${FOOTBALL}/fixtures/${sampleFixtureId}`,
        params: { include: 'participants;scores;xGFixture' },
        requires: (d: any) => d?.xgfixture != null || d?.xGFixture != null,
        requiresLabel: 'campo xGFixture assente',
      },
      {
        label: 'include: odds  ⭐',
        usedBy: 'odds.ts + betting-recommendations.routes.ts:63 — EV e Kelly',
        addon: 'Odds (pre-match)',
        url: `${FOOTBALL}/fixtures/${sampleFixtureId}`,
        params: { include: 'odds.bookmaker;odds.market' },
        requires: (d: any) => Array.isArray(d?.odds) && d.odds.length > 0,
        requiresLabel: 'array odds vuoto',
      },
      {
        label: 'include: lineups',
        usedBy: 'lineups.ts — confidence su formazioni',
        url: `${FOOTBALL}/fixtures/${sampleFixtureId}`,
        params: { include: 'lineups' },
        requires: (d: any) => Array.isArray(d?.lineups) && d.lineups.length > 0,
        requiresLabel: 'array lineups vuoto',
      },
      {
        label: 'include: sidelined (infortuni)',
        usedBy: 'injuries.ts — confidence su assenze',
        url: `${FOOTBALL}/teams/8`,
        params: { include: 'sidelined' },
      },
    );
  } else {
    console.log(warn('  Nessuna fixture di test trovata: salto i probe sugli include.\n'));
  }

  for (const p of probes) {
    await probe(p);
    const r = results[results.length - 1];
    line(r.outcome, p.label, r.detail, p.usedBy);
    await new Promise(r => setTimeout(r, 250));
  }
}

// ---------------------------------------------------------------- verdetto
function verdict(missingLeagues: string[]) {
  console.log('\n═══ 4. Cosa devi abilitare ═══\n');

  const bad = results.filter(r => r.outcome !== 'OK');
  const addons = new Set(
    bad.filter(r => r.probe.addon).map(r => r.probe.addon as string)
  );

  if (missingLeagues.length) {
    console.log(ko('  LEGHE MANCANTI') + ' — il piano non le copre:');
    missingLeagues.forEach(l => console.log(`      · ${l}`));
    console.log(dim('      Servono per storico e predizioni. Aggiungile al piano o togliele'));
    console.log(dim('      da ALLOWED_LEAGUES (fixtures.routes.ts:20 e statistics.ts:298).\n'));
  }

  if (addons.size) {
    console.log(ko('  ADD-ON DA ATTIVARE') + ':');
    addons.forEach(a => console.log(`      · ${a}`));
    console.log('');
  }

  const blocking = bad.filter(r => r.probe.label.includes('fixtures/between'));
  if (blocking.length) {
    console.log(ko('  BLOCCANTE') + ': senza fixtures/between il progetto non parte proprio.\n');
  }

  if (!missingLeagues.length && !addons.size && !bad.length) {
    console.log(ok('  Tutto quello che il codice usa e\' accessibile con questa chiave.\n'));
  }

  console.log(dim('  Legenda: NEGATO = non nel piano · VUOTO = accessibile ma senza dati'));
  console.log(dim('  (per VUOTO ricontrolla con una fixture di una lega che hai nel piano)\n'));
}

(async () => {
  console.log(`\nChiave: ...${API_KEY!.slice(-6)}   Base: ${FOOTBALL}`);
  await account();
  const missing = await leagues();
  await features();
  verdict(missing);
})().catch(e => {
  console.error('\nErrore inatteso:', e.message);
  process.exit(1);
});
