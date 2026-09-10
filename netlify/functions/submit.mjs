/* The only thing that talks to Notion.
 *
 * The browser posts a payload here; this holds the token and writes the row.
 * The token is read from the environment and never leaves this process — it is
 * not in the bundle the browser downloads, and it is not in this repository.
 *
 * Environment:
 *   NOTION_TOKEN        required — internal integration token
 *   NOTION_SURVEY_DB    optional — defaults to the Research Survey database
 *   NOTION_CONTACT_DB   optional — defaults to Research Contact Preferences
 *   ALLOWED_ORIGINS     optional — comma-separated; defaults to the Footprint hosts
 *
 * Both databases must be shared with the integration in Notion, or every write
 * comes back 404.
 */

import { ALL_QUESTIONS, QUESTIONS } from '../../assets/js/questionnaire.js';
import { nameOf } from '../../assets/js/countries.js';

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const SURVEY_DB = process.env.NOTION_SURVEY_DB || '45270517-759d-451e-8490-38830bef92fc';
const CONTACT_DB = process.env.NOTION_CONTACT_DB || 'f4351c9d-b98a-4d18-a1d9-aa5ab4b8482b';

const DEFAULT_ORIGINS = [
  'https://research.footprint-intelligence.com',
  'https://www.footprint-intelligence.com',
  'http://localhost:8795',
  'http://127.0.0.1:8795',
];

/* A public write endpoint, so the shape of what it will accept is fixed here
   rather than trusted from the client. */
const MAX_BODY = 96 * 1024;

const byId = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

/* ---------- helpers ---------- */

const label = (o) => o?.notion || o?.label || '';

/* Notion caps a single rich-text run at 2000 characters, so anything longer —
   the raw payload in particular — goes in as consecutive runs. */
function richText(value, { limit = 2000, runs = 90 } = {}) {
  const s = String(value ?? '');
  if (!s) return [];
  const out = [];
  for (let i = 0; i < s.length && out.length < runs; i += limit) {
    out.push({ type: 'text', text: { content: s.slice(i, i + limit) } });
  }
  return out;
}

function optionLabel(q, id) {
  const o = (q.options || []).find((x) => x.id === id);
  return o ? label(o) : id;
}

function matrixLines(q, entry) {
  const rows = q.type === 'dynamic-matrix' ? (entry.rows || []) : (q.rows || []);
  const scaleOf = (id) => q.scale.find((s) => s.id === id)?.label || id;
  return rows
    .map((r) => `${r.label.replace(/\.$/, '')}: ${scaleOf(entry.value[r.id])}`)
    .join('\n');
}

function countryText(q, entry) {
  const ids = Array.isArray(entry.value) ? entry.value : [entry.value];
  return ids.map((id) => {
    const ex = (q.exclusiveOptions || []).find((o) => o.id === id);
    if (ex) return label(ex);
    if (id === '__decline') return 'Prefer not to say';
    return `${nameOf(id)} (${id})`;
  }).join(', ');
}

/* ---------- payload -> Notion properties ---------- */

function buildProperties(payload, key) {
  const props = {
    'Response ID': { title: [{ type: 'text', text: { content: key } }] },
    Submitted: { date: { start: payload.submittedAt } },
    Version: { rich_text: richText(payload.version) },
    Status: { select: { name: payload.eligible === false ? 'Screened out' : 'Complete' } },
  };

  const others = [];

  for (const entry of payload.responses || []) {
    if (entry.status !== 'answered') continue;
    const q = byId.get(entry.id);
    if (!q || !q.notionProp) continue;

    if (entry.other) others.push(`${q.id}: ${entry.other}`);

    switch (q.type) {
      case 'single':
        props[q.notionProp] = { select: { name: optionLabel(q, entry.value) } };
        break;
      case 'multi':
        props[q.notionProp] = {
          multi_select: (entry.value || []).map((id) => ({ name: optionLabel(q, id) })),
        };
        break;
      case 'matrix':
      case 'dynamic-matrix':
        props[q.notionProp] = { rich_text: richText(matrixLines(q, entry)) };
        break;
      case 'country':
      case 'country-multi':
        props[q.notionProp] = { rich_text: richText(countryText(q, entry)) };
        break;
      default:
        props[q.notionProp] = { rich_text: richText(entry.value) };
    }
  }

  props['Other specifications'] = { rich_text: richText(others.join('\n')) };
  /* The lossless record. Everything above is a convenience for reading in
     Notion; this is what an export should be built from. */
  props['Raw JSON'] = { rich_text: richText(JSON.stringify(payload)) };
  return props;
}

/* ---------- Notion ---------- */

async function notion(path, init = {}) {
  const res = await fetch(`${NOTION}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Notion responded ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/* The submission key is the row title, so "has this already been written" is a
   single equality query. A retry after a timeout finds its own earlier write
   instead of duplicating it. */
async function alreadyWritten(databaseId, key) {
  try {
    const data = await notion(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: 'Response ID', title: { equals: key } },
        page_size: 1,
      }),
    });
    return (data.results || []).length > 0;
  } catch {
    /* If the check itself fails, fall through and attempt the write — a
       duplicate row is a smaller problem than a lost response. */
    return false;
  }
}

/* ---------- HTTP ---------- */

function cors(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : allowed[0],
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'Origin',
  };
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) },
});

export default async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  if (req.method === 'GET') {
    if (!process.env.NOTION_TOKEN) {
      return json({ ok: false, error: 'NOTION_TOKEN is not set on this deployment.' }, 200, origin);
    }
    try {
      /* Prove the integration can actually reach the database, rather than
         only that a token exists. A survey that says "saved" and was not is
         the one failure mode worth a round trip at boot. */
      await notion(`/databases/${SURVEY_DB}`);
      return json({ ok: true, destination: 'notion' }, 200, origin);
    } catch (err) {
      return json({ ok: false, error: `Notion is not reachable: ${err.message}` }, 200, origin);
    }
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, origin);
  if (!process.env.NOTION_TOKEN) {
    return json({ ok: false, error: 'NOTION_TOKEN is not set on this deployment.' }, 500, origin);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'Payload too large' }, 413, origin);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'Malformed request' }, 400, origin); }

  const key = String(body.key || '').slice(0, 64);
  if (!key) return json({ ok: false, error: 'Missing submission key' }, 400, origin);

  try {
    if (body.kind === 'contact') {
      const { email, report, interview } = body.contact || {};
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return json({ ok: false, error: 'A valid email address is required.' }, 400, origin);
      }
      if (!report && !interview) {
        return json({ ok: false, error: 'Select at least one preference.' }, 400, origin);
      }
      await notion('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { database_id: CONTACT_DB },
          properties: {
            Email: { title: [{ type: 'text', text: { content: String(email).slice(0, 200) } }] },
            'Send me the report': { checkbox: Boolean(report) },
            'Follow-up research interview': { checkbox: Boolean(interview) },
            Submitted: { date: { start: new Date().toISOString() } },
            Study: { rich_text: richText(body.study || '') },
          },
        }),
      });
      return json({ ok: true }, 200, origin);
    }

    const payload = body.payload;
    if (!payload || !Array.isArray(payload.responses) || payload.responses.length === 0) {
      return json({ ok: false, error: 'No responses in the request.' }, 400, origin);
    }

    if (await alreadyWritten(SURVEY_DB, key)) {
      return json({ ok: true, duplicate: true }, 200, origin);
    }

    const page = await notion('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: SURVEY_DB },
        properties: buildProperties(payload, key),
      }),
    });
    return json({ ok: true, id: page.id }, 200, origin);
  } catch (err) {
    /* Notion's own message is useful to us and harmless to show — it says
       things like "Could not find database", which is exactly what someone
       configuring this needs to read. */
    const status = err.status === 404 ? 502 : 502;
    return json({ ok: false, error: `Could not save to Notion: ${err.message}` }, status, origin);
  }
};

export const config = { path: '/.netlify/functions/submit' };

/* Exported for the mapping test in tools/check-mapping.mjs. */
export { buildProperties };
