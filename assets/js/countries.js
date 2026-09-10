/* Countries and territories.
 *
 * Only the ISO 3166-1 alpha-2 codes are shipped; the display names come from
 * Intl.DisplayNames, so the list stays under a kilobyte and reads in the
 * browser's own language rather than in ours. Codes are what gets stored, so a
 * name that changes in a future ICU release does not rewrite past answers.
 */

const CODES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN '
  + 'BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM '
  + 'DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU '
  + 'GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY '
  + 'KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW '
  + 'MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE '
  + 'RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK '
  + 'TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');

const naming = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region', fallback: 'none' });
  } catch {
    return null;
  }
})();

/* A browser without Intl.DisplayNames would otherwise offer a list of bare
   two-letter codes, which is worse than useless — in that case the field falls
   back to free text (see ui.js). */
export const SUPPORTED = Boolean(naming);

export const PREFER_NOT_TO_SAY = { code: '__decline', name: 'Prefer not to say', tail: true };

export const COUNTRIES = CODES
  .map((code) => ({ code, name: naming ? naming.of(code) : code }))
  .filter((c) => c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
byCode.set(PREFER_NOT_TO_SAY.code, PREFER_NOT_TO_SAY);

export const nameOf = (code) => byCode.get(code)?.name || code;

/* Accent-insensitive prefix-first matching: "cote" finds Côte d'Ivoire, and
   typing "in" puts India above Argentina. */
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function search(query, { limit = 60 } = {}) {
  const q = fold(query.trim());
  if (!q) return COUNTRIES.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const c of COUNTRIES) {
    const n = fold(c.name);
    if (n.startsWith(q)) starts.push(c);
    else if (n.includes(q)) contains.push(c);
  }
  return starts.concat(contains).slice(0, limit);
}
