/* Talking to the backend.
 *
 * The browser never holds a Notion token. It posts a payload to a function
 * that holds one server-side, and that function is the only thing that knows
 * the database exists.
 *
 * Two rules this module exists to enforce:
 *   - Never claim a response was saved unless the server said so.
 *   - Never save the same response twice, however many times the button is
 *     pressed or the network retried.
 */

import { SUBMIT_ENDPOINT, STUDY } from './config.js?v=20260910120425';

/* One key per completed questionnaire, generated before the first attempt and
   reused by every retry. A retry after a timeout is the dangerous case: the
   first request may well have succeeded. The server treats a repeat key as the
   same submission. */
const newKey = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

let inFlight = null;

async function post(body, { timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* a proxy or a 404 page */ }
    if (!res.ok) {
      const msg = data?.error
        || (res.status === 404
          ? 'The submission service is not deployed at this address.'
          : `The server responded ${res.status}.`);
      throw Object.assign(new Error(msg), { status: res.status });
    }
    if (!data?.ok) throw new Error(data?.error || 'The server did not confirm the save.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* Is there a backend at all? Asked once at boot so the page can be honest
   about what will happen before anyone spends fifteen minutes answering. */
export async function probe() {
  try {
    const res = await fetch(SUBMIT_ENDPOINT, { method: 'GET' });
    if (!res.ok) return { live: false, reason: `endpoint responded ${res.status}` };
    const data = await res.json();
    return { live: Boolean(data?.ok), destination: data?.destination, reason: data?.error };
  } catch (err) {
    return { live: false, reason: err.message };
  }
}

export function createSubmitter() {
  let key = null;
  let saved = false;

  return {
    get saved() { return saved; },

    /* Repeated clicks join the request already running rather than starting a
       second one. */
    async submit(payload) {
      if (saved) return { ok: true, duplicate: true };
      if (inFlight) return inFlight;
      key = key || newKey();
      inFlight = post({ kind: 'response', key, study: STUDY.id, payload })
        .then((r) => { saved = true; return r; })
        .finally(() => { inFlight = null; });
      return inFlight;
    },

    /* Contact preferences are a separate request to a separate store. A
       failure here can never undo or endanger the research submission. */
    async contact({ email, report, interview }) {
      return post({
        kind: 'contact',
        key: newKey(),
        study: STUDY.id,
        contact: { email, report, interview },
      });
    },
  };
}
