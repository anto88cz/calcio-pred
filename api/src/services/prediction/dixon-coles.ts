/**
 * Dixon-Coles a massima verosimiglianza.
 *
 * Riferimento: Dixon & Coles (1997), "Modelling Association Football Scores and
 * Inefficiencies in the Football Betting Market".
 *
 * Un solo modello, stimato sui dati, al posto della catena di moltiplicatori
 * applicati uno dopo l'altro. Ogni squadra ha due parametri, attacco e difesa;
 * il campionato ha un vantaggio casa e una correzione sui punteggi bassi:
 *
 *   lambda_casa      = exp(mu + attacco_casa + difesa_trasf + gamma)
 *   lambda_trasferta = exp(mu + attacco_trasf + difesa_casa)
 *
 * I gol delle due squadre sono Poisson indipendenti TRANNE che sui quattro
 * punteggi piu' bassi, dove la Poisson indipendente sbaglia in modo
 * sistematico: nella realta' 0-0 e 1-1 capitano piu' spesso di quanto preveda,
 * 1-0 e 0-1 meno. La funzione tau corregge proprio quelle quattro celle.
 *
 *   tau(0,0) = 1 - lambda_c * lambda_t * rho
 *   tau(0,1) = 1 + lambda_c * rho
 *   tau(1,0) = 1 + lambda_t * rho
 *   tau(1,1) = 1 - rho
 *   tau(x,y) = 1  altrove
 *
 * Con rho negativo tau(0,0) e tau(1,1) salgono sopra 1 e le altre due scendono:
 * e' la direzione osservata nei dati. Il codice precedente usava rho positivo,
 * cioe' la correzione al contrario, e senza vincolo di positivita' produceva
 * probabilita' negative sulle partite ad alto punteggio.
 *
 * La verosimiglianza pesa ogni partita per exp(-xi * giorni_fa): le partite
 * vecchie contano meno, e quanto meno lo decide la cross-validation invece di
 * fasce scritte a mano.
 */

/** Una partita conclusa, l'unico input di cui il modello ha bisogno. */
export interface DCMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  date: Date;
  /** xG reali della partita, se disponibili */
  homeXg?: number | null;
  awayXg?: number | null;
  /** giorni dall'ultima partita di ciascuna squadra */
  homeRest?: number | null;
  awayRest?: number | null;
  /**
   * Forma recente: quanto la squadra ha reso sopra o sotto le attese nelle
   * ultime partite. Va calcolata a monte, guardando solo indietro.
   */
  homeForm?: number | null;
  awayForm?: number | null;
  /**
   * Quanto della formazione tipo e' effettivamente in campo, fra 0 e 1.
   * Va calcolata a monte dalle formazioni delle partite precedenti.
   */
  homeLineup?: number | null;
  awayLineup?: number | null;
}

/**
 * Su cosa stimare attacco e difesa.
 *
 * I gol sono l'esito che conta, ma sono pochi e molto rumorosi: su dieci
 * partite la varianza del risultato domina il segnale sulla forza della
 * squadra. L'xG misura la qualita' delle occasioni create, e' molto piu'
 * stabile nel tempo e in letteratura predice i gol futuri meglio dei gol
 * passati.
 *
 * 'blend' usa w*gol + (1-w)*xG come osservazione: resta una quantita' non
 * negativa, quindi la quasi-verosimiglianza di Poisson vale ancora.
 */
export type FitTarget = 'goals' | 'xg' | 'blend';

export interface DixonColesParams {
  /** intercetta: livello medio dei gol del campionato */
  mu: number;
  /** vantaggio del campo, in scala logaritmica */
  gamma: number;
  /** correzione sui punteggi bassi */
  rho: number;
  /** decadimento temporale usato in stima */
  xi: number;
  attack: Record<number, number>;
  defence: Record<number, number>;
  /** log-verosimiglianza pesata raggiunta */
  logLikelihood: number;
  matches: number;
  teams: number;
  /** data piu' recente nel campione: da qui si contano i giorni per il decadimento */
  referenceDate: string;
  /** su cosa sono state stimate le forze */
  target: FitTarget;
  /** scarti casa/trasferta, quando venueSplit e' attivo */
  attackHome?: Record<number, number>;
  attackAway?: Record<number, number>;
  defenceHome?: Record<number, number>;
  defenceAway?: Record<number, number>;
  /** coefficiente dei giorni di riposo, quando restEffect e' attivo */
  restCoef?: number;
  /** coefficiente dei residui testa a testa, quando h2hEffect e' attivo */
  h2hCoef?: number;
  /** coefficiente della forma recente, quando formEffect e' attivo */
  formCoef?: number;
  /** coefficiente della disponibilita' della formazione tipo */
  lineupCoef?: number;
  /** residuo medio per coppia e per squadra: chiave "teamId:avversarioId" */
  h2hResidual?: Record<string, { sum: number; n: number }>;
  /** partite del campione che avevano xG, quando serviva */
  matchesWithXg?: number;
}

export interface FitOptions {
  /** decadimento temporale; 0 = tutte le partite pesano uguale */
  xi?: number;
  iterations?: number;
  learningRate?: number;
  /** data rispetto a cui calcolare l'eta' delle partite (default: la piu' recente) */
  referenceDate?: Date;
  /** su cosa stimare le forze (default: 'goals') */
  target?: FitTarget;
  /** peso dei gol con target 'blend' (default 0.5) */
  blendWeight?: number;
  /**
   * Attacco e difesa separati per campo.
   *
   * Oggi ogni squadra ha un solo attacco e una sola difesa, piu' un vantaggio
   * casa uguale per tutti. Ma alcune squadre rendono in casa molto piu' della
   * media e altre quasi per niente. Si stimano quattro scarti per squadra
   * attorno ai valori medi, tenuti vicini a zero da una penalita' ridge: senza
   * quella, una squadra con poche partite si prenderebbe scarti enormi
   * inseguendo il rumore.
   */
  venueSplit?: boolean;
  /** forza della penalita' sugli scarti casa/trasferta (default 6) */
  venueRidge?: number;
  /** Usa i giorni di riposo come covariata sul lambda di ciascuna squadra. */
  restEffect?: boolean;
  /**
   * Effetto testa a testa.
   *
   * L'idea da verificare: due squadre che si affrontano da anni sviluppano un
   * rapporto specifico che va oltre la loro forza. Il "vantaggio nei
   * precedenti" che si legge sui giornali pero' e' quasi sempre forza
   * travestita: se una squadra batte sempre l'altra e' perche' e' piu' forte,
   * e questo il modello lo sa gia'.
   *
   * Quindi non si guardano i risultati ma i RESIDUI: nelle sfide precedenti
   * quella squadra ha segnato piu' o meno di quanto il modello prevedesse? E
   * quello scarto si ripete? Il residuo di ogni partita viene calcolato
   * escludendo la partita stessa (leave-one-out), altrimenti il coefficiente
   * si stimerebbe su se stesso e risulterebbe positivo per costruzione.
   */
  h2hEffect?: boolean;
  /**
   * Forma delle ultime partite come covariata.
   *
   * Attenzione a cosa significa qui: NON e' "quanti punti ha fatto", che sarebbe
   * di nuovo la forza della squadra, gia' dentro attacco e difesa. E' il
   * RESIDUO: quanto ha segnato in piu' o in meno di quanto il modello stesso
   * prevedesse. Se un residuo positivo nelle ultime cinque predice un residuo
   * positivo nella prossima, esiste una forma che va oltre la forza. Altrimenti
   * quello che si chiama "momento" e' rumore.
   */
  formEffect?: boolean;
  /**
   * Disponibilita' della formazione tipo.
   *
   * E' l'unica informazione che il mercato ha e il modello no: le formazioni
   * ufficiali escono un'ora prima del fischio, quindi chi scommette dopo
   * l'annuncio le conosce. La covariata misura quanti titolari abituali sono
   * effettivamente in campo: una squadra che ne perde quattro dovrebbe segnare
   * meno e subire di piu'.
   */
  lineupEffect?: boolean;
  /**
   * Pooling parziale sulle forze di squadra.
   *
   * Senza, una squadra con una o due partite in archivio si prende parametri
   * estremi: su un campione con le coppe nazionali il modello attribuiva a
   * squadre di categoria inferiore difese da exp(-6.8) gol subiti, cioe' zero,
   * perche' avevano incassato poco in una partita sola. Quei valori assurdi si
   * portavano dietro anche l'intercetta, e i gol attesi medi scendevano da 1.25
   * a 0.85 per tutti.
   *
   * La penalita' tira ogni forza verso la media del campionato, ma pesata per
   * quante partite quella squadra ha davvero: forte dove i dati sono pochi,
   * trascurabile dove sono tanti. E' il comportamento di un posteriore
   * bayesiano, dove il prior conta in proporzione inversa all'informazione.
   *
   * Il peso per squadra e' mediana(partite) / partite_squadra. Serve perche'
   * Adam normalizza per l'ampiezza del gradiente: una penalita' costante
   * peserebbe uguale su una squadra con settanta partite e una con due, e
   * infatti cosi' il log-loss peggiorava (0.9980 -> 1.0009) mentre i parametri
   * assurdi sparivano. Con il peso corretto si ottengono entrambe le cose.
   */
  teamRidge?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limiti entro cui tau resta positiva per i lambda dati.
 *
 * Senza questo vincolo tau(0,0) puo' diventare negativa e la "matrice di
 * probabilita'" contiene celle negative, che la normalizzazione poi nasconde.
 */
export function clampRho(rho: number, lambdaHome: number, lambdaAway: number): number {
  const lower = Math.max(-1 / lambdaHome, -1 / lambdaAway);
  const upper = Math.min(1 / (lambdaHome * lambdaAway), 1);
  // margine per non finire esattamente su tau = 0
  const eps = 1e-6;
  return Math.min(upper - eps, Math.max(lower + eps, rho));
}

export function tau(x: number, y: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  const r = clampRho(rho, lambdaHome, lambdaAway);
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * r;
  if (x === 0 && y === 1) return 1 + lambdaHome * r;
  if (x === 1 && y === 0) return 1 + lambdaAway * r;
  if (x === 1 && y === 1) return 1 - r;
  return 1;
}

/** Derivate di log tau rispetto a lambda_casa, lambda_trasferta e rho. */
function tauGradients(x: number, y: number, lh: number, la: number, rho: number) {
  const r = clampRho(rho, lh, la);
  const t = tau(x, y, lh, la, rho);
  let dLh = 0, dLa = 0, dRho = 0;
  if (x === 0 && y === 0) { dLh = -la * r; dLa = -lh * r; dRho = -lh * la; }
  else if (x === 0 && y === 1) { dLh = r; dRho = lh; }
  else if (x === 1 && y === 0) { dLa = r; dRho = la; }
  else if (x === 1 && y === 1) { dRho = -1; }
  return { dLh: dLh / t, dLa: dLa / t, dRho: dRho / t };
}

/**
 * Stima i parametri con Adam sulle derivate analitiche.
 *
 * Nelder-Mead, suggerito spesso in letteratura, non regge qui: con un centinaio
 * di squadre i parametri sono oltre duecento e un metodo senza gradiente non
 * converge in tempi utili.
 *
 * Identificabilita': attacco e difesa sono definiti a meno di una costante
 * (si puo' aggiungere c a tutti gli attacchi e toglierlo a mu senza cambiare
 * nulla). Si azzera la media dei due vettori a ogni passo.
 */
export function fitDixonColes(matches: DCMatch[], options: FitOptions = {}): DixonColesParams {
  const xi = options.xi ?? 0.0;
  const iterations = options.iterations ?? 3000;
  const lr = options.learningRate ?? 0.05;
  const target = options.target ?? 'goals';
  const blendWeight = options.blendWeight ?? 0.5;

  if (matches.length === 0) throw new Error('Nessuna partita per la stima');

  /**
   * Osservazione su cui si massimizza la verosimiglianza.
   *
   * Con target xG si usa una quasi-verosimiglianza di Poisson: il termine
   * x*log(lambda) - lambda resta ben definito per x continuo e non negativo, e
   * il fattoriale che manca non dipende dai parametri, quindi non cambia ne'
   * l'ottimo ne' il gradiente. Se l'xG manca su una partita si ricade sui gol,
   * cosi' il campione non si assottiglia.
   */
  const observed = (m: DCMatch): [number, number] => {
    if (target === 'goals') return [m.homeGoals, m.awayGoals];
    const hx = m.homeXg ?? null, ax = m.awayXg ?? null;
    if (hx === null || ax === null) return [m.homeGoals, m.awayGoals];
    if (target === 'xg') return [hx, ax];
    return [
      blendWeight * m.homeGoals + (1 - blendWeight) * hx,
      blendWeight * m.awayGoals + (1 - blendWeight) * ax,
    ];
  };

  // tau corregge quattro punteggi interi: non ha senso su una quantita'
  // continua come l'xG. Con target diverso da 'goals' rho viene stimato dopo,
  // sui gol veri, tenendo ferme le forze.
  const fitRhoJointly = target === 'goals';
  const matchesWithXg = matches.filter(m => m.homeXg != null && m.awayXg != null).length;

  const referenceDate = options.referenceDate
    ?? new Date(Math.max(...matches.map(m => m.date.getTime())));

  const teamIds = [...new Set(matches.flatMap(m => [m.homeTeamId, m.awayTeamId]))].sort((a, b) => a - b);
  const index = new Map<number, number>();
  teamIds.forEach((id, i) => index.set(id, i));
  const T = teamIds.length;

  // Peso temporale, calcolato una volta sola.
  const weights = matches.map(m => {
    const ageDays = (referenceDate.getTime() - m.date.getTime()) / DAY_MS;
    return xi > 0 ? Math.exp(-xi * Math.max(0, ageDays)) : 1;
  });

  const obs = matches.map(observed);

  // Partite per squadra, per pesare il pooling: chi ha pochi dati viene tirato
  // verso il centro, chi ne ha tanti quasi per niente.
  const played = new Float64Array(T);
  for (const m of matches) {
    played[index.get(m.homeTeamId)!] += 1;
    played[index.get(m.awayTeamId)!] += 1;
  }
  const sortedCounts = Array.from(played).sort((a, b) => a - b);
  const medianPlayed = sortedCounts[Math.floor(sortedCounts.length / 2)] || 1;
  const ridgeWeight = new Float64Array(T);
  for (let i = 0; i < T; i++) ridgeWeight[i] = medianPlayed / Math.max(played[i], 1);

  const teamRidge = options.teamRidge ?? 0;
  const venueSplit = options.venueSplit ?? false;
  const venueRidge = options.venueRidge ?? 6;
  const restEffect = options.restEffect ?? false;

  /** riposo centrato su una settimana e limitato a 14 giorni */
  const restFeat = (d: number | null | undefined): number =>
    d == null ? 0 : (Math.min(Math.max(d, 0), 14) - 7) / 7;
  const rest = matches.map(m => [restFeat(m.homeRest), restFeat(m.awayRest)] as [number, number]);

  const formEffect = options.formEffect ?? false;
  // I residui di forma arrivano gia' calcolati e limitati: valori estremi
  // nascono da una singola goleada e non da una tendenza.
  const clampForm = (v: number | null | undefined) =>
    v == null ? 0 : Math.min(Math.max(v, -1.5), 1.5);
  const form = matches.map(m => [clampForm(m.homeForm), clampForm(m.awayForm)] as [number, number]);
  let formCoef = 0;

  const lineupEffect = options.lineupEffect ?? false;
  // Centrata su 1 = formazione tipo al completo, cosi' il coefficiente si legge
  // come "quanto si perde per ogni titolare mancante".
  const lineupFeat = (v: number | null | undefined) => (v == null ? 0 : v - 1);
  const lineup = matches.map(m => [lineupFeat(m.homeLineup), lineupFeat(m.awayLineup)] as [number, number]);
  let lineupCoef = 0;

  const attack = new Float64Array(T);
  const defence = new Float64Array(T);
  const attHome = new Float64Array(T);
  const attAway = new Float64Array(T);
  const defHome = new Float64Array(T);
  const defAway = new Float64Array(T);
  let restCoef = 0;
  let mu = Math.log(
    matches.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0) / (2 * matches.length) || 1.3
  );
  let gamma = 0.25;
  let rho = -0.05;

  // stato Adam
  const mAtt = new Float64Array(T), vAtt = new Float64Array(T);
  const mDef = new Float64Array(T), vDef = new Float64Array(T);
  const mAH = new Float64Array(T), vAH = new Float64Array(T);
  const mAA = new Float64Array(T), vAA = new Float64Array(T);
  const mDH = new Float64Array(T), vDH = new Float64Array(T);
  const mDA = new Float64Array(T), vDA = new Float64Array(T);
  let mMu = 0, vMu = 0, mGam = 0, vGam = 0, mRho = 0, vRho = 0, mRest = 0, vRest = 0;
  let mForm = 0, vForm = 0, mLine = 0, vLine = 0;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  const gAtt = new Float64Array(T);
  const gDef = new Float64Array(T);
  const gAH = new Float64Array(T), gAA = new Float64Array(T);
  const gDH = new Float64Array(T), gDA = new Float64Array(T);
  let logLikelihood = 0;

  for (let it = 1; it <= iterations; it++) {
    gAtt.fill(0); gDef.fill(0);
    gAH.fill(0); gAA.fill(0); gDH.fill(0); gDA.fill(0);
    let gMu = 0, gGam = 0, gRho = 0, gRest = 0, gForm = 0, gLine = 0;
    logLikelihood = 0;

    for (let k = 0; k < matches.length; k++) {
      const m = matches[k];
      const w = weights[k];
      const h = index.get(m.homeTeamId)!;
      const a = index.get(m.awayTeamId)!;

      const restH = restEffect ? restCoef * rest[k][0] : 0;
      const restA = restEffect ? restCoef * rest[k][1] : 0;
      const formH = formEffect ? formCoef * form[k][0] : 0;
      const formA = formEffect ? formCoef * form[k][1] : 0;
      const lineH = lineupEffect ? lineupCoef * lineup[k][0] : 0;
      const lineA = lineupEffect ? lineupCoef * lineup[k][1] : 0;
      const lh = Math.exp(mu + attack[h] + attHome[h] + defence[a] + defAway[a] + gamma + restH + formH + lineH);
      const la = Math.exp(mu + attack[a] + attAway[a] + defence[h] + defHome[h] + restA + formA + lineA);
      const [x, y] = obs[k];

      const t = fitRhoJointly ? tau(x, y, lh, la, rho) : 1;
      logLikelihood += w * (Math.log(Math.max(t, 1e-12)) + x * Math.log(lh) - lh + y * Math.log(la) - la);

      const g = fitRhoJointly
        ? tauGradients(x, y, lh, la, rho)
        : { dLh: 0, dLa: 0, dRho: 0 };

      // d/d(log lambda) = (x - lambda) + dlogtau/dlambda * lambda
      const sh = w * ((x - lh) + g.dLh * lh);
      const sa = w * ((y - la) + g.dLa * la);

      gAtt[h] += sh; gDef[a] += sh; gGam += sh;
      gAtt[a] += sa; gDef[h] += sa;
      gAH[h] += sh; gDA[a] += sh;
      gAA[a] += sa; gDH[h] += sa;
      gMu += sh + sa;
      gRho += w * g.dRho;
      gRest += sh * rest[k][0] + sa * rest[k][1];
      gForm += sh * form[k][0] + sa * form[k][1];
      gLine += sh * lineup[k][0] + sa * lineup[k][1];
    }

    // Adam: si massimizza, quindi si sale lungo il gradiente.
    const bc1 = 1 - Math.pow(b1, it);
    const bc2 = 1 - Math.pow(b2, it);
    const step = (g: number, m: number, v: number): [number, number, number] => {
      const mn = b1 * m + (1 - b1) * g;
      const vn = b2 * v + (1 - b2) * g * g;
      return [lr * (mn / bc1) / (Math.sqrt(vn / bc2) + eps), mn, vn];
    };

    for (let i = 0; i < T; i++) {
      const pull = teamRidge * ridgeWeight[i];
      const [dA, mA, vA] = step(gAtt[i] - 2 * pull * attack[i], mAtt[i], vAtt[i]);
      attack[i] += dA; mAtt[i] = mA; vAtt[i] = vA;
      const [dD, mD, vD] = step(gDef[i] - 2 * pull * defence[i], mDef[i], vDef[i]);
      defence[i] += dD; mDef[i] = mD; vDef[i] = vD;
    }

    if (venueSplit) {
      // Il termine -2*ridge*delta e' la derivata della penalita': tira ogni
      // scarto verso zero, tanto piu' forte quanto piu' si e' allontanato.
      const pairs: Array<[Float64Array, Float64Array, Float64Array, Float64Array]> = [
        [attHome, gAH, mAH, vAH], [attAway, gAA, mAA, vAA],
        [defHome, gDH, mDH, vDH], [defAway, gDA, mDA, vDA],
      ];
      for (const [param, grad, mState, vState] of pairs) {
        for (let i = 0; i < T; i++) {
          const [d, mv, vv] = step(grad[i] - 2 * venueRidge * param[i], mState[i], vState[i]);
          param[i] += d; mState[i] = mv; vState[i] = vv;
        }
      }
    }

    if (restEffect) {
      const [dR, mR, vR] = step(gRest, mRest, vRest);
      restCoef += dR; mRest = mR; vRest = vR;
    }

    if (formEffect) {
      const [dF, mF, vF] = step(gForm, mForm, vForm);
      formCoef += dF; mForm = mF; vForm = vF;
    }

    if (lineupEffect) {
      const [dL, mL, vL] = step(gLine, mLine, vLine);
      lineupCoef += dL; mLine = mL; vLine = vL;
    }
    const [dMu, m1, v1] = step(gMu, mMu, vMu); mu += dMu; mMu = m1; vMu = v1;
    const [dGa, m2, v2] = step(gGam, mGam, vGam); gamma += dGa; mGam = m2; vGam = v2;
    if (fitRhoJointly) {
      const [dRh, m3, v3] = step(gRho, mRho, vRho); rho += dRh; mRho = m3; vRho = v3;
    }

    // rho globale entro limiti prudenti; il vincolo esatto e' per partita, in tau
    rho = Math.min(0.25, Math.max(-0.25, rho));

    // vincolo di identificabilita'
    let sumA = 0, sumD = 0;
    for (let i = 0; i < T; i++) { sumA += attack[i]; sumD += defence[i]; }
    const meanA = sumA / T, meanD = sumD / T;
    for (let i = 0; i < T; i++) { attack[i] -= meanA; defence[i] -= meanD; }
    mu += meanA + meanD;

    if (venueSplit) {
      // Anche gli scarti vanno centrati, o si sovrappongono a gamma e a mu.
      let sAH = 0, sAA = 0, sDH = 0, sDA = 0;
      for (let i = 0; i < T; i++) { sAH += attHome[i]; sAA += attAway[i]; sDH += defHome[i]; sDA += defAway[i]; }
      const mAHv = sAH / T, mAAv = sAA / T, mDHv = sDH / T, mDAv = sDA / T;
      for (let i = 0; i < T; i++) {
        attHome[i] -= mAHv; attAway[i] -= mAAv; defHome[i] -= mDHv; defAway[i] -= mDAv;
      }
      gamma += mAHv + mDAv;
      mu += mAAv + mDHv;
    }
  }

  // --- testa a testa: residui per coppia, poi un solo coefficiente ---
  let h2hCoef: number | undefined;
  let h2hResidual: Record<string, { sum: number; n: number }> | undefined;

  if (options.h2hEffect) {
    const lambdasOf = (m: DCMatch): [number, number] => {
      const h = index.get(m.homeTeamId)!, a = index.get(m.awayTeamId)!;
      const rH = restEffect ? restCoef * restFeat(m.homeRest) : 0;
      const rA = restEffect ? restCoef * restFeat(m.awayRest) : 0;
      return [
        Math.exp(mu + attack[h] + attHome[h] + defence[a] + defAway[a] + gamma + rH),
        Math.exp(mu + attack[a] + attAway[a] + defence[h] + defHome[h] + rA),
      ];
    };

    // Residuo relativo: (gol osservati - gol attesi) / gol attesi. Relativo e
    // non assoluto perche' un gol in piu' pesa diversamente su una partita da
    // 0.8 gol attesi e su una da 2.5.
    h2hResidual = {};
    const add = (team: number, opponent: number, value: number) => {
      const k = `${team}:${opponent}`;
      const cur = h2hResidual![k] || { sum: 0, n: 0 };
      cur.sum += value; cur.n += 1;
      h2hResidual![k] = cur;
    };
    const perMatch: Array<[string, number, string, number]> = [];
    for (const m of matches) {
      const [lh, la] = lambdasOf(m);
      const rh = (m.homeGoals - lh) / Math.max(lh, 0.2);
      const ra = (m.awayGoals - la) / Math.max(la, 0.2);
      add(m.homeTeamId, m.awayTeamId, rh);
      add(m.awayTeamId, m.homeTeamId, ra);
      perMatch.push([`${m.homeTeamId}:${m.awayTeamId}`, rh, `${m.awayTeamId}:${m.homeTeamId}`, ra]);
    }

    // Media leave-one-out: la partita non contribuisce al proprio residuo.
    const loo = (key: string, own: number): number => {
      const cur = h2hResidual![key];
      if (!cur || cur.n < 2) return 0;
      return (cur.sum - own) / (cur.n - 1);
    };

    let best = 0, bestLL = -Infinity;
    for (let c = -0.4; c <= 0.4001; c += 0.02) {
      let ll = 0;
      for (let k = 0; k < matches.length; k++) {
        const m = matches[k], w = weights[k];
        const [lh0, la0] = lambdasOf(m);
        const lh = lh0 * Math.exp(c * loo(perMatch[k][0], perMatch[k][1]));
        const la = la0 * Math.exp(c * loo(perMatch[k][2], perMatch[k][3]));
        const [x, y] = obs[k];
        ll += w * (x * Math.log(lh) - lh + y * Math.log(la) - la);
      }
      if (ll > bestLL) { bestLL = ll; best = c; }
    }
    h2hCoef = parseFloat(best.toFixed(3));
  }

  if (!fitRhoJointly) {
    // Le forze vengono dall'xG; il livello e la correzione sui punteggi bassi
    // vanno riportati sui gol veri, che sono cio' che si deve predire.
    mu += levelCorrectionOnGoals(matches, weights, attack, defence, index, mu, gamma);
    rho = fitRhoOnGoals(matches, weights, attack, defence, index, mu, gamma);
  }

  const attackOut: Record<number, number> = {};
  const defenceOut: Record<number, number> = {};
  const attHomeOut: Record<number, number> = {};
  const attAwayOut: Record<number, number> = {};
  const defHomeOut: Record<number, number> = {};
  const defAwayOut: Record<number, number> = {};
  teamIds.forEach((id, i) => {
    attackOut[id] = attack[i]; defenceOut[id] = defence[i];
    attHomeOut[id] = attHome[i]; attAwayOut[id] = attAway[i];
    defHomeOut[id] = defHome[i]; defAwayOut[id] = defAway[i];
  });

  return {
    mu, gamma, rho, xi,
    attack: attackOut,
    defence: defenceOut,
    logLikelihood,
    matches: matches.length,
    teams: T,
    referenceDate: referenceDate.toISOString(),
    target,
    matchesWithXg,
    ...(venueSplit ? {
      attackHome: attHomeOut, attackAway: attAwayOut,
      defenceHome: defHomeOut, defenceAway: defAwayOut,
    } : {}),
    ...(restEffect ? { restCoef } : {}),
    ...(h2hCoef !== undefined ? { h2hCoef, h2hResidual } : {}),
    ...(formEffect ? { formCoef } : {}),
    ...(lineupEffect ? { lineupCoef } : {}),
  };
}

/**
 * Scarto di livello fra xG e gol.
 *
 * Un modello stimato sull'xG produce lambda che sono xG attesi. Se il fornitore
 * dell'xG e' sistematicamente sopra o sotto i gol realmente segnati, tutti i
 * mercati Over/Under ne risentono. Si sposta mu della quantita' che pareggia i
 * due totali sul campione di stima: log(gol totali / lambda totali).
 */
function levelCorrectionOnGoals(
  matches: DCMatch[], weights: number[],
  attack: Float64Array, defence: Float64Array, index: Map<number, number>,
  mu: number, gamma: number
): number {
  let sumLambda = 0, sumGoals = 0;
  for (let k = 0; k < matches.length; k++) {
    const m = matches[k], w = weights[k];
    const h = index.get(m.homeTeamId)!, a = index.get(m.awayTeamId)!;
    sumLambda += w * (Math.exp(mu + attack[h] + defence[a] + gamma) + Math.exp(mu + attack[a] + defence[h]));
    sumGoals += w * (m.homeGoals + m.awayGoals);
  }
  if (sumLambda <= 0 || sumGoals <= 0) return 0;
  return Math.log(sumGoals / sumLambda);
}

/**
 * Stima rho sui gol veri tenendo ferme le forze: una sola incognita, quindi
 * basta una ricerca su griglia. Serve perche' tau corregge quattro punteggi
 * interi e non e' definibile sull'xG.
 */
function fitRhoOnGoals(
  matches: DCMatch[], weights: number[],
  attack: Float64Array, defence: Float64Array, index: Map<number, number>,
  mu: number, gamma: number
): number {
  let best = 0, bestLL = -Infinity;
  for (let r = -0.20; r <= 0.10001; r += 0.005) {
    let ll = 0;
    for (let k = 0; k < matches.length; k++) {
      const m = matches[k], w = weights[k];
      const h = index.get(m.homeTeamId)!, a = index.get(m.awayTeamId)!;
      const lh = Math.exp(mu + attack[h] + defence[a] + gamma);
      const la = Math.exp(mu + attack[a] + defence[h]);
      ll += w * Math.log(Math.max(tau(m.homeGoals, m.awayGoals, lh, la, r), 1e-12));
    }
    if (ll > bestLL) { bestLL = ll; best = r; }
  }
  return parseFloat(best.toFixed(4));
}

export interface DCPrediction {
  lambdaHome: number;
  lambdaAway: number;
  prob1: number;
  probX: number;
  prob2: number;
  /**
   * Doppie chance. Sono somme esatte di celle della stessa matrice, quindi la
   * correlazione fra gli esiti e' gia' dentro: niente prodotto di probabilita'
   * come si fa nelle multiple, che assumerebbe indipendenza fra eventi che
   * indipendenti non sono.
   */
  dc1X: number;
  dc12: number;
  dcX2: number;
  over: Record<string, number>;
  under: Record<string, number>;
  bttsYes: number;
  bttsNo: number;
  /** true se una delle due squadre non era nel campione di stima */
  hasUnknownTeam: boolean;
}

const THRESHOLDS = [0.5, 1.5, 2.5, 3.5, 4.5];

/**
 * Lambda attesi per una partita.
 *
 * Una squadra mai vista in stima (neopromossa, o prima giornata) prende
 * attacco e difesa pari a zero, cioe' la media del campionato. E' un'ipotesi
 * dichiarata, non un fallback nascosto: chi legge la predizione lo vede dal
 * campo hasUnknownTeam.
 */
export function expectedGoals(
  params: DixonColesParams,
  homeTeamId: number,
  awayTeamId: number,
  restDays?: { home?: number | null; away?: number | null },
  formValues?: { home?: number | null; away?: number | null },
  lineupValues?: { home?: number | null; away?: number | null }
) {
  const aH = params.attack[homeTeamId], dH = params.defence[homeTeamId];
  const aA = params.attack[awayTeamId], dA = params.defence[awayTeamId];
  const hasUnknownTeam = aH === undefined || aA === undefined;

  const attackHome = aH ?? 0, defenceHome = dH ?? 0;
  const attackAway = aA ?? 0, defenceAway = dA ?? 0;

  const at = (rec: Record<number, number> | undefined, id: number) => rec?.[id] ?? 0;
  const restFeat = (d: number | null | undefined) =>
    d == null ? 0 : (Math.min(Math.max(d, 0), 14) - 7) / 7;
  const rc = params.restCoef ?? 0;
  const fc = params.formCoef ?? 0;
  const formFeat = (v: number | null | undefined) =>
    v == null ? 0 : Math.min(Math.max(v, -1.5), 1.5);
  const lc = params.lineupCoef ?? 0;
  const lineFeat = (v: number | null | undefined) => (v == null ? 0 : v - 1);

  // Testa a testa: serve almeno una sfida precedente, altrimenti resta zero.
  const hc = params.h2hCoef ?? 0;
  const h2h = (team: number, opponent: number): number => {
    const cur = params.h2hResidual?.[`${team}:${opponent}`];
    return cur && cur.n >= 1 ? hc * (cur.sum / cur.n) : 0;
  };

  return {
    lambdaHome: Math.exp(
      params.mu + attackHome + at(params.attackHome, homeTeamId)
      + defenceAway + at(params.defenceAway, awayTeamId)
      + params.gamma + rc * restFeat(restDays?.home)
      + fc * formFeat(formValues?.home)
      + lc * lineFeat(lineupValues?.home)
      + h2h(homeTeamId, awayTeamId)
    ),
    lambdaAway: Math.exp(
      params.mu + attackAway + at(params.attackAway, awayTeamId)
      + defenceHome + at(params.defenceHome, homeTeamId)
      + rc * restFeat(restDays?.away)
      + fc * formFeat(formValues?.away)
      + lc * lineFeat(lineupValues?.away)
      + h2h(awayTeamId, homeTeamId)
    ),
    hasUnknownTeam,
  };
}

function poissonPmf(k: number, lambda: number): number {
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Matrice dei punteggi e mercati derivati.
 *
 * maxGoals = 12 lascia fuori una massa trascurabile; la matrice viene
 * comunque rinormalizzata, quindi la coda tagliata non sbilancia i mercati.
 */
export function predict(
  params: DixonColesParams,
  homeTeamId: number,
  awayTeamId: number,
  maxGoals = 12,
  restDays?: { home?: number | null; away?: number | null },
  formValues?: { home?: number | null; away?: number | null },
  lineupValues?: { home?: number | null; away?: number | null }
): DCPrediction {
  const { lambdaHome, lambdaAway, hasUnknownTeam } =
    expectedGoals(params, homeTeamId, awayTeamId, restDays, formValues, lineupValues);

  const pHome = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambdaHome));
  const pAway = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambdaAway));

  const matrix: number[][] = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    matrix[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      const p = pHome[x] * pAway[y] * tau(x, y, lambdaHome, lambdaAway, params.rho);
      matrix[x][y] = p;
      total += p;
    }
  }

  let prob1 = 0, probX = 0, prob2 = 0, bttsYes = 0;
  const overCount: Record<string, number> = {};
  for (const t of THRESHOLDS) overCount[String(t)] = 0;

  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      const p = matrix[x][y] / total;
      if (x > y) prob1 += p; else if (x === y) probX += p; else prob2 += p;
      if (x > 0 && y > 0) bttsYes += p;
      for (const t of THRESHOLDS) if (x + y > t) overCount[String(t)] += p;
    }
  }

  const over: Record<string, number> = {};
  const under: Record<string, number> = {};
  for (const t of THRESHOLDS) {
    over[String(t)] = overCount[String(t)];
    under[String(t)] = 1 - overCount[String(t)];
  }

  return {
    lambdaHome, lambdaAway,
    prob1, probX, prob2,
    dc1X: prob1 + probX,
    dc12: prob1 + prob2,
    dcX2: probX + prob2,
    over, under,
    bttsYes, bttsNo: 1 - bttsYes,
    hasUnknownTeam,
  };
}
