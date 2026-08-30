/**
 * Parsing delle date Sportmonks.
 *
 * L'API v3 restituisce timestamp UTC nel formato "YYYY-MM-DD HH:mm:ss": spazio
 * come separatore e nessun suffisso di fuso. `new Date(...)` su una stringa del
 * genere applica il fuso LOCALE del processo, quindi in Italia la data risulta
 * spostata indietro di 1 o 2 ore rispetto al calcio d'inizio reale.
 *
 * Non e' un dettaglio estetico: nel backtest lo storico squadra viene filtrato
 * con `data < calcio d'inizio della partita da predire`, e uno scarto di due ore
 * bastava a far rientrare la partita stessa nel proprio storico — il modello
 * prediceva un risultato avendolo gia' tra i dati di input. Si vedeva nei
 * numeri: pareggi indovinati nel 54% dei casi contro una frequenza reale del
 * 25%.
 *
 * Accetta anche le date senza orario ("YYYY-MM-DD"), che JavaScript interpreta
 * gia' come UTC, e i timestamp ISO completi.
 */
export function parseSportmonksDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return value;
  if (!value) return new Date(NaN);

  const raw = String(value).trim();

  // Gia' esplicito sul fuso (Z oppure ±hh:mm): affidabile cosi' com'e'.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return new Date(raw);

  // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ssZ"
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + 'Z');
  }

  return new Date(raw);
}
