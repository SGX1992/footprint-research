/* Motion helpers.
 *
 * One rule holds everywhere: motion carries meaning about *where things came
 * from* — an option that was just chosen, a question that has just opened, a
 * screen arriving from the right. It never delays an interaction. Every
 * animation here is on transform and opacity only, so none of it forces layout
 * while a respondent is reading.
 *
 * Reduced motion is not a degraded path: the same states are reached, the
 * transitions between them are simply instant.
 */

const query = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };

export let reduced = query.matches;
query.addEventListener?.('change', (e) => { reduced = e.matches; });

export const EASE = {
  /* A long, decelerating ease — the house curve. Things settle rather than
     arrive. */
  out: 'cubic-bezier(.16,1,.3,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  /* A touch of overshoot, only ever on small marks (ticks, bars). */
  spring: 'cubic-bezier(.34,1.56,.64,1)',
};

export function animate(el, keyframes, options = {}) {
  if (!el || typeof el.animate !== 'function') return null;
  if (reduced) {
    /* Land on the final frame without playing anything. */
    const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes;
    for (const [k, v] of Object.entries(last || {})) {
      if (k !== 'offset' && k !== 'easing') el.style[k] = Array.isArray(v) ? v[v.length - 1] : v;
    }
    return null;
  }
  return el.animate(keyframes, { duration: 420, easing: EASE.out, fill: 'both', ...options });
}

/* A group of elements entering as one gesture rather than as n separate
   arrivals — each starts before the one before it has finished. */
export function stagger(els, { from = 14, delay = 0, step = 42, duration = 500 } = {}) {
  [...els].forEach((el, i) => {
    animate(el, [
      { opacity: 0, transform: `translateY(${from}px)` },
      { opacity: 1, transform: 'none' },
    ], { duration, delay: delay + i * step });
  });
}

/* Words masked by their own line box, revealed from below. Used once, on the
   landing headline — a whole page of this would be exhausting. */
export function revealWords(el, { delay = 0, step = 55, duration = 900 } = {}) {
  const words = el.textContent.split(/(\s+)/);
  el.textContent = '';
  const spans = [];
  for (const w of words) {
    if (/^\s+$/.test(w)) { el.append(w); continue; }
    const mask = document.createElement('span');
    mask.className = 'word';
    const inner = document.createElement('span');
    inner.textContent = w;
    mask.append(inner);
    el.append(mask);
    spans.push(inner);
  }
  spans.forEach((s, i) => {
    animate(s, [
      { transform: 'translateY(105%)' },
      { transform: 'none' },
    ], { duration, delay: delay + i * step });
  });
  return spans.length * step + duration;
}

/* Scrolls a newly opened question to a comfortable reading position instead of
   leaving it wherever the collapse happened to put it. Never scrolls if the
   element is already well placed — a jump the respondent did not ask for is
   worse than a slightly low question. */
export function bringIntoView(el, { top = 0.28 } = {}) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const comfortable = r.top > vh * 0.12 && r.bottom < vh * 0.92;
  if (comfortable) return;
  const target = window.scrollY + r.top - vh * top;
  window.scrollTo({ top: Math.max(0, target), behavior: reduced ? 'auto' : 'smooth' });
}

/* Draws an SVG stroke on. The tick inside a chosen option. */
export function drawStroke(path, { duration = 340, delay = 0 } = {}) {
  if (!path || typeof path.getTotalLength !== 'function') return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  animate(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
    { duration, delay, easing: EASE.out });
}
