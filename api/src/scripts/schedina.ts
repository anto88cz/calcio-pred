/**
 * Schedina per una data: le partite non ancora iniziate, la giocata scelta per
 * ognuna, e la combinazione che avvicina di piu' la quota obiettivo.
 *
 * Stesso modello del backtest (fitDixonColes/predict con gli stessi default) e
 * stessa lettura delle quote di predict-today, dal modulo condiviso live-odds.
 *
 * Differenze deliberate rispetto a uptest-multiple.js:
 *
 * - Lo stake consigliato e' un quarto di Kelly con tetto, non il 30% fisso.
 *   Il 30% e' rovinoso anche con un vantaggio reale: a quota 1.4 una vincita
 *   moltiplica il capitale per 1.12 e una perdita per 0.70, quindi il conto
 *   cresce solo sopra il 75.9% di vincenti mentre il pareggio in valore atteso
 *   e' al 71.4%. Nel backtest sulla stagione 2025-26 quella strategia portava
 *   100 euro a 0.20.
 * - La schedina e' singola per default. Ogni evento aggiunto moltiplica il
 *   margine del banco: due eventi al 5% fanno il 10%, tre il 15%.
 * - Viene stampato il margine della combinazione, che nessuno mostra mai.
 *
 * Criteri di scelta (--criterio):
 *
 *   prezzo  (default)  lo scarto fra il miglior prezzo e il consenso de-viggato
 *                      degli altri bookmaker. Non usa il modello.
 *   ev                 il valore atteso secondo il modello. Attenzione: massimizzare
 *                      l'EV del modello significa cercare la partita dove il modello
 *                      diverge di piu' dal mercato, cioe' dove piu' probabilmente
 *                      sbaglia, visto che il mercato lo batte in log-loss.
 *   prob               la probabilita' piu' alta. E' l'estremo opposto e altrettanto
 *                      inutile: massima probabilita' vuol dire minima quota.
 *
 * Nessuno dei tre ha un vantaggio dimostrato. Vedi le NOTE in fondo all'output.
 *
 * Uso:
 *   npx tsx src/scripts/schedina.ts
 *   npx tsx src/scripts/schedina.ts 2026-08-31 --eventi 2 --quota 1.8
 *   npx tsx src/scripts/schedina.ts --criterio ev --capitale 250
 *   npx tsx src/scripts/schedina.ts --scarto-max 0.10 --quota-max 5
 *   npx tsx src/scripts/schedina.ts --quota-min 1.6
 *   npx tsx src/scripts/schedina.ts --criterio sicure --prob-min 0.65 --elenco
 *   npx tsx src/scripts/schedina.ts --proposte --quante 3
 *   npx tsx src/scripts/schedina.ts --spiega "Aston Villa"
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';
import { fitDixonColes, predict, DCMatch, DixonColesParams } from '../services/prediction/dixon-coles';
import { extractOdds, buildCandidates, selectPick, score, Quote, CandidateRow, Criterio } from '../services/prediction/live-odds';
import { ALLOWED_LEAGUES } from '../config/supported-leagues';

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

interface Event {
  kickoff: Date;
  league: string;
  home: string;
  away: string;
  /**
   * La giocata scelta, col consenso di mercato de-viggato accanto alla
   * probabilita' del modello. Il consenso e' la stima migliore che abbiamo:
   * il mercato batte il modello in log-loss ogni volta che lo misuriamo.
   */
  pick: CandidateRow;
  /** valore atteso secondo il MODELLO */
  ev: number;
  lambdaHome: number;
  lambdaAway: number;
}

/** Orario italiano, che e' quello che serve per sapere se si fa in tempo. */
function romeTime(d: Date): string {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

async function main() {
  const dateArg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a) || /^\d{2}\/\d{2}\/\d{4}$/.test(a));
  const date = dateArg
    ? (dateArg.includes('/') ? dateArg.split('/').reverse().join('-') : dateArg)
    : new Date().toISOString().slice(0, 10);

  const maxEvents = parseInt(arg('--eventi', '1'), 10);
  const targetOdds = parseFloat(arg('--quota', '0')) || null;
  // Con --proposte valgono i default del tipster, che non sono quelli generici.
  //
  // Sono presi da due misure indipendenti, non scelti a occhio. Su 418 giocate
  // della stagione, scegliendo fra le sole giocate col prezzo sopra l'equo:
  // ordinare per probabilita' rende +9.75% (z 2.07), per crescita +9.02%, per
  // scarto +8.73%. E su 3.501 partite, il favorito del mercato al miglior
  // prezzo rende +6.38% +/-2.80 sopra il 70% di consenso, mentre le stesse
  // giocate alla quota media rendono +2.52%: e' il line shopping a pagare.
  //
  // La quota resta sotto 3.00 perche' il margine del banco e' caricato sugli
  // outsider: oltre l'8 le giocate rendono -17.86% +/-7.53, l'unica riga
  // storicamente significativa, ed e' negativa.
  const modoTipster = process.argv.includes('--proposte');

  const criterioArg = arg('--criterio', modoTipster ? 'sicure' : 'prezzo');
  const criterio: Criterio =
    criterioArg === 'ev' ? 'ev' : criterioArg === 'prob' ? 'prob'
      : criterioArg === 'sicure' ? 'sicure' : 'prezzo';
  const capitale = parseFloat(arg('--capitale', '100'));
  const minBooks = parseInt(arg('--min-book', '5'), 10);
  const maxDeviation = parseFloat(arg('--scarto-max', '0.15'));
  const maxOdds = parseFloat(arg('--quota-max', modoTipster ? '3.0' : '8'));
  const minOdds = parseFloat(arg('--quota-min', modoTipster ? '1.15' : '1.4'));
  // Il pavimento sullo scarto e' la regola che rende il resto sensato: non si
  // gioca mai un prezzo sotto la quota equa, qualunque cosa dica il modello.
  const minDeviation = parseFloat(arg('--scarto-min', modoTipster ? '0.001' : '0')) || -Infinity;
  const minProb = parseFloat(arg('--prob-min', '0'));

  console.log('═'.repeat(64));
  console.log(`  SCHEDINA — ${date}`);
  console.log('═'.repeat(64));

  const history = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED, homeGoals: { not: null }, awayGoals: { not: null } },
    select: { homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true, date: true, xg_home: true, xg_away: true },
    orderBy: { date: 'asc' },
  });
  const matches: DCMatch[] = history.map(f => ({
    homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
    homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
    homeXg: f.xg_home, awayXg: f.xg_away, date: f.date,
  }));

  const now = new Date();
  const params: DixonColesParams = fitDixonColes(matches, {
    xi: 0.002, iterations: 2500, target: 'blend', blendWeight: 0.35,
    teamRidge: 0.05, referenceDate: now,
  });
  console.log(`  modello su ${matches.length} partite, ${params.teams} squadre`);
  console.log(`  criterio: ${criterio}   ·   quote da ${minOdds.toFixed(2)} a ${maxOdds.toFixed(2)}, scarto entro ${(maxDeviation * 100).toFixed(0)}%` +
    (minDeviation > -Infinity ? `, almeno ${(minDeviation * 100).toFixed(1)}%` : '') +
    (minProb > 0 ? `, probabilita' di mercato almeno ${(minProb * 100).toFixed(0)}%` : '') + '\n');

  const client = getSportsmonksClient();
  const response: any = await client.get(`/fixtures/between/${date}/${date}`, {
    include: 'participants;league', per_page: '100',
  });

  const teams = await prisma.team.findMany({ select: { id: true, apiId: true } });
  const byApi = new Map(teams.map(t => [t.apiId, t.id]));
  const lastPlayed = new Map<number, Date>();
  for (const m of matches) { lastPlayed.set(m.homeTeamId, m.date); lastPlayed.set(m.awayTeamId, m.date); }

  const events: Event[] = [];
  let started = 0, noTeams = 0, noOdds = 0, noConsensus = 0, outlier = 0;

  for (const fx of (response?.data || [])) {
    if (!ALLOWED_LEAGUES.includes(fx.league_id)) continue;
    const kickoff = new Date(String(fx.starting_at).replace(' ', 'T') + 'Z');
    if (kickoff <= now) { started++; continue; }   // gia' iniziata: non giocabile

    const home = (fx.participants || []).find((p: any) => p.meta?.location === 'home');
    const away = (fx.participants || []).find((p: any) => p.meta?.location === 'away');
    const h = home && byApi.get(home.id);
    const a = away && byApi.get(away.id);
    if (!h || !a) { noTeams++; continue; }

    const restOf = (id: number) => {
      const prev = lastPlayed.get(id);
      return prev ? (kickoff.getTime() - prev.getTime()) / DAY_MS : null;
    };
    const p = predict(params, h, a, 12, { home: restOf(h), away: restOf(a) });

    let quotes: Record<string, Quote> = {};
    try {
      const oddsResp: any = await client.get(`/fixtures/${fx.id}`, { include: 'odds' });
      quotes = extractOdds(oddsResp?.data?.odds || []);
    } catch { /* senza quote la partita non e' giocabile */ }

    const rows = buildCandidates(quotes, p, minBooks);
    if (!rows.length) { noConsensus++; continue; }

    // Perche' proprio quella giocata: tutte le alternative di una partita, con
    // il prezzo migliore contro la quota equa del consenso. Serve per capire
    // che la scelta e' di prezzo, non di pronostico: con il criterio 'prezzo'
    // la probabilita' del modello viene mostrata e basta.
    const spiega = arg('--spiega', '');
    if (spiega && `${home.name} ${away.name}`.toLowerCase().includes(spiega.toLowerCase())) {
      const scelta = selectPick(rows, criterio, { minOdds, maxOdds, minDeviation, maxDeviation, minProb });
      console.log('\n' + '='.repeat(78));
      console.log(`  ${home.name} - ${away.name}   (${fx.league?.name || fx.league_id})   gol attesi ${p.lambdaHome.toFixed(2)} - ${p.lambdaAway.toFixed(2)}`);
      console.log('='.repeat(78));
      console.log('  giocata          modello   mercato   equa   miglior prezzo (book)  scarto  book  esito');
      for (const r of [...rows].sort((a, b) => b.deviation - a.deviation)) {
        const fuori: string[] = [];
        if (r.best < minOdds) fuori.push(`quota < ${minOdds}`);
        if (r.best > maxOdds) fuori.push(`quota > ${maxOdds}`);
        if (r.deviation < minDeviation) fuori.push('scarto troppo basso');
        if (r.deviation > maxDeviation) fuori.push('scarto sospetto');
        if (r.consensusProb < minProb) fuori.push('probabilita troppo bassa');
        console.log('  ' + r.label.padEnd(16) +
          (r.modelProb * 100).toFixed(1).padStart(6) + '%' +
          (r.consensusProb * 100).toFixed(1).padStart(9) + '%' +
          (1 / r.consensusProb).toFixed(2).padStart(8) +
          (r.best.toFixed(2) + ' (' + r.book + ')').padStart(15) +
          ((r.deviation >= 0 ? '+' : '') + (r.deviation * 100).toFixed(1) + '%').padStart(9) +
          String(r.books).padStart(5) + '  ' +
          (scelta && scelta.key === r.key ? 'SCELTA' : fuori.length ? 'escluso: ' + fuori[0] : ''));
      }
      console.log('');
    }
    const best = selectPick(rows, criterio, {
      minOdds, maxOdds, minDeviation, maxDeviation, minProb,
    });
    if (!best) { outlier++; continue; }

    events.push({
      kickoff, league: fx.league?.name || String(fx.league_id),
      home: home.name, away: away.name,
      pick: best,
      ev: best.modelProb * best.best - 1,
      lambdaHome: p.lambdaHome, lambdaAway: p.lambdaAway,
    });
  }

  console.log(`  partite giocabili: ${events.length}` +
    (started ? `   (${started} gia' iniziate)` : '') +
    (noTeams ? `   (${noTeams} squadre senza storico)` : '') +
    (noOdds ? `   (${noOdds} senza quote)` : '') +
    (noConsensus ? `   (${noConsensus} senza consenso calcolabile)` : '') +
    (outlier ? `   (${outlier} solo fuori dai limiti di quota ${minOdds.toFixed(2)}-${maxOdds.toFixed(2)})` : '') + '\n');

  if (!events.length) {
    console.log(`  Nessuna giocata sopra quota ${minOdds.toFixed(2)} per questa data.\n`);
    await prisma.$disconnect();
    return;
  }

  // Ordina per il criterio scelto e componi la combinazione.
  events.sort((x, y) => score(y.pick, criterio) - score(x.pick, criterio));

  // Elenco di tutte le giocate che passano i filtri, ordinate secondo il
  // criterio. Serve per decidere: la scheda mostra una riga sola, ma quello che
  // conta per scegliere e' vedere quali prezzi stanno sopra la quota equa e
  // quali sotto.
  if (process.argv.includes('--elenco')) {
    console.log('-'.repeat(78));
    console.log('  TUTTE LE GIOCATE CHE PASSANO I FILTRI');
    console.log('-'.repeat(78));
    console.log('  ora    partita                                   giocata          quota   equa   scarto  book');
    for (const e of events) {
      const fair = 1 / e.pick.consensusProb;
      const dev = e.pick.deviation;
      const nome = `${e.home} - ${e.away}`;
      console.log('  ' + romeTime(e.kickoff) + '  ' +
        (nome.length > 40 ? nome.slice(0, 39) + '~' : nome).padEnd(41) +
        e.pick.label.padEnd(16) +
        e.pick.best.toFixed(2).padStart(6) +
        fair.toFixed(2).padStart(7) +
        ((dev >= 0 ? '+' : '') + (dev * 100).toFixed(1) + '%').padStart(9) +
        String(e.pick.books).padStart(5) +
        (dev > 0 ? '   <--' : ''));
    }
    console.log('-'.repeat(78));
    console.log(`  ${events.filter(e => e.pick.deviation > 0).length} su ${events.length} hanno un prezzo sopra la quota equa.\n`);
  }

  // Le proposte: tutte le singole e tutte le COPPIE, ordinate per crescita
  // attesa della cassa.
  //
  // Non per scarto dal prezzo equo, che era l'ordinamento precedente e aveva un
  // difetto sistematico: fra venti bookmaker il disaccordo e' massimo sugli
  // esiti improbabili, quindi lo scarto piu' grande sta quasi sempre sulla
  // gamba con meno probabilita' di passare, e ordinare per scarto la mette in
  // cima. E' il favourite-longshot bias visto dal lato del selettore.
  //
  // La crescita attesa con puntata frazionale f su una giocata a probabilita' p
  // e quota o vale p*ln(1 + f(o-1)) + (1-p)*ln(1-f). Pesa vantaggio e
  // probabilita' insieme: una gamba al +3% che passa una volta su tre vale meno
  // di una al +2% che passa tre volte su quattro.
  //
  // Le coppie si valutano TUTTE, non si prendono le due gambe migliori: la
  // coppia migliore quasi mai e' fatta dalle prime due della classifica.
  if (process.argv.includes('--proposte')) {
    const quante = parseInt(arg('--quante', '3'), 10);
    const maxGambe = Math.max(1, Math.min(2, parseInt(arg('--max-gambe', '2'), 10)));

    interface Proposta {
      legs: Event[]; odds: number; prob: number; modelProb: number;
      margin: number; ev: number; frazione: number; crescita: number;
    }

    const valuta = (legs: Event[]): Proposta => {
      const odds = legs.reduce((s, e) => s * e.pick.best, 1);
      const prob = legs.reduce((s, e) => s * e.pick.consensusProb, 1);
      const modelProb = legs.reduce((s, e) => s * e.pick.modelProb, 1);
      const margin = legs.reduce((s, e) => s * (1 + e.pick.overround), 1) - 1;
      const b = odds - 1;
      const kelly = b > 0 ? (b * prob - (1 - prob)) / b : 0;
      const frazione = Math.max(0, Math.min(0.05, kelly * 0.25));
      const crescita = frazione > 0
        ? prob * Math.log(1 + frazione * b) + (1 - prob) * Math.log(1 - frazione)
        : 0;
      return { legs, odds, prob, modelProb, margin, ev: prob * odds - 1, frazione, crescita };
    };

    const proposte: Proposta[] = events.map(e => valuta([e]));
    if (maxGambe >= 2) {
      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) proposte.push(valuta([events[i], events[j]]));
      }
    }
    proposte.sort((x, y) => y.crescita - x.crescita);

    const buone = proposte.filter(p => p.crescita > 0);
    console.log('='.repeat(78));
    console.log(`  PROPOSTE — ${buone.length} giocate su ${proposte.length} fanno crescere la cassa`);
    console.log('='.repeat(78));

    if (!buone.length) {
      console.log('\n  Nessuna. Oggi non si gioca: ogni combinazione disponibile ha valore');
      console.log('  atteso negativo o cosi\' piccolo da non reggere il rischio.\n');
    } else {
      for (const [n, p] of buone.slice(0, quante).entries()) {
        const stake = capitale * p.frazione;
        console.log(`\n  ${n + 1}.  ${p.legs.length === 1 ? 'SINGOLA' : 'DOPPIA'}   quota ${p.odds.toFixed(2)}   ` +
          `probabilita' ${(p.prob * 100).toFixed(1)}%   valore atteso ${(p.ev >= 0 ? '+' : '') + (p.ev * 100).toFixed(1)}%`);
        for (const e of p.legs) {
          console.log(`      ${romeTime(e.kickoff)}  ${e.home} - ${e.away}  (${e.league})`);
          console.log(`              ${e.pick.label} @ ${e.pick.best.toFixed(2)}  book ${e.pick.book}   ` +
            `mercato ${(e.pick.consensusProb * 100).toFixed(1)}%   modello ${(e.pick.modelProb * 100).toFixed(1)}%   ` +
            `prezzo ${(e.pick.deviation >= 0 ? '+' : '') + (e.pick.deviation * 100).toFixed(1)}%`);
        }
        console.log(`      puntata ${stake.toFixed(2)} EUR su ${capitale.toFixed(0)}   ` +
          `vincita ${(stake * p.odds).toFixed(2)}   margine del banco ${(p.margin * 100).toFixed(2)}%`);
        console.log(`      crescita attesa della cassa: ${(p.crescita * 100).toFixed(4)}% per giocata`);
      }

      // Il confronto che il tipster non fa mai e che decide il conto: la stessa
      // coppia giocata come due singole vince molto piu' spesso, e il margine
      // del banco si paga una volta invece che due.
      const migliore = buone[0];
      if (migliore.legs.length === 2) {
        const singole = migliore.legs.map(e => valuta([e]));
        const crescitaSingole = singole.reduce((s, p) => s + p.crescita, 0);
        console.log('\n  ' + '-'.repeat(74));
        console.log(`  Le stesse due partite giocate come SINGOLE:`);
        console.log(`    puntata ${singole.reduce((s, p) => s + capitale * p.frazione, 0).toFixed(2)} EUR in tutto   ` +
          `crescita ${(crescitaSingole * 100).toFixed(4)}% contro ${(migliore.crescita * 100).toFixed(4)}% della doppia`);
        console.log(`    ${crescitaSingole > migliore.crescita ? 'Meglio le singole.' : 'Meglio la doppia.'}`);
      }
      console.log('');
    }
    console.log('='.repeat(78) + '\n');
  }

  // Quanti eventi si possono davvero mettere in schedina.
  const wanted = Math.max(1, Math.min(maxEvents, events.length));
  let slip: Event[];
  let targetMiss: number | null = null;

  if (targetOdds && wanted > 1) {
    // Combinazione di ESATTAMENTE `wanted` eventi che si avvicina di piu' alla
    // quota obiettivo. La ricerca sui prefissi piu' corti, che c'era prima,
    // restituiva quasi sempre un evento solo: qualunque singola sta piu' vicina
    // a 1.8 di qualunque doppia, che parte dal prodotto di due quote. Chi
    // chiede tre eventi ne vuole tre.
    const pool = events.slice(0, 12);
    let bestCombo: Event[] | null = null;
    let bestDist = Infinity;
    const walk = (start: number, current: Event[]) => {
      if (current.length === wanted) {
        const odds = current.reduce((s, e) => s * e.pick.best, 1);
        const dist = Math.abs(odds - targetOdds);
        if (dist < bestDist) { bestDist = dist; bestCombo = [...current]; }
        return;
      }
      for (let i = start; i < pool.length; i++) walk(i + 1, [...current, pool[i]]);
    };
    walk(0, []);
    slip = bestCombo ?? events.slice(0, wanted);
    const reached = slip.reduce((s, e) => s * e.pick.best, 1);
    // La quota minima di una combinazione a N eventi e' il prodotto delle N
    // quote piu' basse: sotto quella nessun obiettivo e' raggiungibile, e
    // tacerlo farebbe passare per scelta quello che e' un limite.
    if (Math.abs(reached - targetOdds) / targetOdds > 0.10) targetMiss = reached;
  } else {
    slip = events.slice(0, wanted);
  }

  if (wanted < maxEvents) {
    console.log(`  Richiesti ${maxEvents} eventi, disponibili ${events.length}.\n`);
  }

  const totalOdds = slip.reduce((s, e) => s * e.pick.best, 1);
  const modelProb = slip.reduce((s, e) => s * e.pick.modelProb, 1);
  const consensusProb = slip.reduce((s, e) => s * e.pick.consensusProb, 1);

  // Il margine del banco si moltiplica evento per evento: due mercati al 5%
  // non fanno il 5%, fanno il 10.25%. E' calcolato sulla famiglia completa di
  // ciascun mercato (1/X/2, le tre doppie, Goal/NoGoal, Over/Under), che e'
  // l'unico modo di misurarlo: da un esito solo non si ricava.
  const overround = slip.reduce((s, e) => s * (1 + e.pick.overround), 1) - 1;
  // Quanto rende la sola scelta del bookmaker, a parita' di giocata.
  const shopping = slip.reduce((s, e) => s * (e.pick.best / e.pick.avg), 1) - 1;

  const evModel = modelProb * totalOdds - 1;
  const evPrice = consensusProb * totalOdds - 1;

  // Kelly sulla probabilita' di MERCATO, che e' la stima migliore che abbiamo:
  // il mercato batte il modello in log-loss ogni volta che lo misuriamo, e la
  // calibrazione lo conferma proprio nella fascia alta che serve qui — dove il
  // modello dice 74% esce il 62%, dove lo dice il mercato esce l'82.8%.
  //
  // Dimensionare sul minimo fra i due, come si faceva prima, lascia allo
  // stimatore peggiore il veto su quello migliore: bastava un modello in
  // disaccordo per azzerare la puntata su una giocata a prezzo buono.
  // --prob modello|min per tornare agli altri due comportamenti.
  const probSource = arg('--prob', 'mercato');
  const pStake = probSource === 'modello' ? modelProb
    : probSource === 'min' ? Math.min(modelProb, consensusProb)
    : consensusProb;
  const b = totalOdds - 1;
  const kelly = b > 0 ? (b * pStake - (1 - pStake)) / b : 0;
  const stakePct = Math.max(0, Math.min(0.05, kelly * 0.25));
  const stake = capitale * stakePct;

  console.log('─'.repeat(64));
  console.log(`  SCHEDINA CONSIGLIATA — ${slip.length} ${slip.length === 1 ? 'evento' : 'eventi'}`);
  console.log('─'.repeat(64) + '\n');

  slip.forEach((e, i) => {
    const dev = e.pick.deviation;
    console.log(`  ${i + 1}. ${e.home} — ${e.away}`);
    console.log(`     ${e.league}   ore ${romeTime(e.kickoff)}`);
    console.log(`     GIOCATA:  ${e.pick.label}  @ ${e.pick.best.toFixed(2)}  (book ${e.pick.book}, ${e.pick.books} quotano, media ${e.pick.avg.toFixed(2)})`);
    console.log(`     consenso de-viggato ${(e.pick.consensusProb * 100).toFixed(1)}% su ${e.pick.consensusBooks} book   →  quota equa ${(1 / e.pick.consensusProb).toFixed(2)}`);
    console.log(`     modello ${(e.pick.modelProb * 100).toFixed(1)}%   gol attesi ${e.lambdaHome.toFixed(2)} - ${e.lambdaAway.toFixed(2)}`);
    const verso = dev >= 0 ? 'sopra' : 'sotto';
    console.log(`     il prezzo paga il ${Math.abs(dev * 100).toFixed(1)}% ${verso} la quota equa   ·   margine del banco su questo mercato ${(e.pick.overround * 100).toFixed(2)}%`);
    console.log(`     EV secondo il modello ${(e.ev >= 0 ? '+' : '') + (e.ev * 100).toFixed(1)}%   ·   secondo il prezzo ${(dev >= 0 ? '+' : '') + (dev * 100).toFixed(1)}%\n`);
  });

  console.log('─'.repeat(64));
  console.log(`  Quota totale:          ${totalOdds.toFixed(2)}   (serve ${(100 / totalOdds).toFixed(1)}% per pareggiare)`);
  console.log(`  Probabilita modello:   ${(modelProb * 100).toFixed(1)}%`);
  console.log(`  Probabilita consenso:  ${(consensusProb * 100).toFixed(1)}%`);
  console.log(`  Margine del banco:     ${(overround * 100).toFixed(2)}%` +
    (slip.length > 1 ? `   su ${slip.length} eventi si moltiplica` : ''));
  console.log(`  Guadagno line shopping: ${(shopping >= 0 ? '+' : '') + (shopping * 100).toFixed(2)}%   (miglior prezzo contro media dei book)`);
  console.log(`  Valore atteso:         modello ${(evModel >= 0 ? '+' : '') + (evModel * 100).toFixed(1)}%   ·   prezzo ${(evPrice >= 0 ? '+' : '') + (evPrice * 100).toFixed(1)}%`);
  if (targetMiss !== null) {
    console.log(`\n  Quota obiettivo ${targetOdds!.toFixed(2)} NON raggiungibile con ${slip.length} eventi:`);
    console.log(`  la combinazione piu' vicina fa ${targetMiss.toFixed(2)}.`);
  }
  console.log('─'.repeat(64) + '\n');

  console.log(`  CON UN CAPITALE DI ${capitale.toFixed(2)} EUR`);
  if (stakePct <= 0) {
    console.log(`     Stake consigliato: 0 — nessun vantaggio, non si gioca.\n`);
  } else {
    console.log(`     Stake (quarto di Kelly, tetto 5%): ${stake.toFixed(2)} EUR  (${(stakePct * 100).toFixed(2)}%)`);
    console.log(`     Vincita se passa: ${(stake * totalOdds).toFixed(2)} EUR   profitto ${(stake * (totalOdds - 1)).toFixed(2)} EUR`);
    console.log(`     A confronto, il 30% fisso: ${(capitale * 0.3).toFixed(2)} EUR — a quota ${totalOdds.toFixed(2)} servirebbe`);
    console.log(`     il ${(100 * Math.log(1 / 0.7) / (Math.log(1 + 0.3 * (totalOdds - 1)) + Math.log(1 / 0.7))).toFixed(1)}% di vincenti solo per non perdere capitale nel tempo.\n`);
  }

  console.log('  NOTE');
  console.log('   • Le quote cambiano: ricontrollale prima di giocare.');
  console.log('   • Orari in fuso Europe/Rome. Le partite gia\' iniziate sono escluse.');
  console.log('   • Il consenso e\' la mediana degli ALTRI bookmaker, de-viggata sulla');
  console.log('     famiglia completa del mercato ed esclusa la quota su cui si punta.');
  console.log('   • Il modello NON batte il prezzo del mercato: sulla stagione 2025-26');
  console.log('     log-loss 0.998 contro 0.977. Un EV positivo secondo il modello');
  console.log('     significa che il modello e quel bookmaker non sono d\'accordo, non');
  console.log('     che il modello ha ragione.');
  console.log('   • Nemmeno l\'EV secondo il prezzo e\' un vantaggio dimostrato: su 14.313');
  console.log('     giocate storiche, puntare dove un book si discosta dal consenso rende');
  console.log('     -4.42% ±1.83. Nessuna soglia di scarto ha ROI positivo e significativo.');
  console.log('     Questo strumento sceglie il prezzo meno peggio, non un\'occasione.\n');

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('Errore:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
