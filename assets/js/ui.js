/* Rendering.
 *
 * One section is one screen. Its questions are stacked so the shape of what is
 * being asked is always visible, and exactly one of them is open:
 *
 *   ahead   the question is legible, the options are not there yet
 *   active  the only controls on the page
 *   done    one line, the answer, and a way back in
 *
 * Every control is a real button with an ARIA role, so the keyboard and a
 * screen reader get the same model the eye does. Nothing here reads the store;
 * it is handed state and hands back intent.
 */

import { COUNTRIES, PREFER_NOT_TO_SAY, SUPPORTED as COUNTRIES_OK, search as searchCountries, nameOf } from './countries.js?v=20260910120425';
import { animate, stagger, drawStroke, bringIntoView, EASE } from './motion.js?v=20260910120425';

/* ---------- tiny DOM helper ---------- */

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const icon = (d, cls) => {
  const svg = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: cls });
  svg.innerHTML = `<path d="${d}"/>`;
  return svg;
};
const TICK = 'M4 12.5l5.2 5.2L20 6.8';
const WARN = 'M12 8v5m0 3.2v.1M10.3 3.9L2.6 17.3A1.9 1.9 0 004.3 20h15.4a1.9 1.9 0 001.7-2.7L13.7 3.9a1.9 1.9 0 00-3.4 0z';

const warnIcon = () => {
  const svg = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  svg.innerHTML = `<path d="${WARN}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
};

/* ---------- summaries for the collapsed state ---------- */

const clip = (s, n = 128) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function summarise(q, store) {
  const v = store.answers[q.id];
  const other = store.other[q.id];
  const labelOf = (id) => {
    const o = (q.options || []).find((x) => x.id === id);
    if (!o) return id;
    return o.other && other ? `${o.label.replace(/\s*\[.*?\]/, '')}: ${other}` : o.label;
  };

  switch (q.type) {
    case 'multi':
      return (v || []).map(labelOf);
    case 'country':
      return [nameOf(v)];
    case 'country-multi':
      return (v || []).map((id) => {
        const ex = (q.exclusiveOptions || []).find((o) => o.id === id);
        return ex ? ex.label : nameOf(id);
      });
    case 'matrix':
    case 'dynamic-matrix': {
      const rows = q.type === 'matrix' ? q.rows : store.dynamicRows(q);
      const scaleLabel = (id) => q.scale.find((s) => s.id === id)?.label || id;
      const shown = rows.slice(0, 2).map((r) => `${r.label.replace(/\.$/, '')} — ${scaleLabel(v[r.id])}`);
      if (rows.length > 2) shown.push(`+${rows.length - 2} more`);
      return shown;
    }
    case 'text':
      return v ? [clip(v)] : [];
    default:
      return [labelOf(v)];
  }
}

/* ---------- option lists ---------- */

function optionButton(q, o, { checked, disabled, onToggle }) {
  const mark = el('span', { class: 'opt__mark' });
  const tick = icon(TICK);
  tick.setAttribute('fill', 'none');
  mark.append(tick);

  const btn = el('button', {
    type: 'button',
    class: `opt opt--${q.type === 'multi' ? 'multi' : 'single'}`,
    role: q.type === 'multi' ? 'checkbox' : 'radio',
    'aria-checked': String(checked),
    'aria-disabled': disabled ? 'true' : null,
    'data-option': o.id,
    onclick: () => onToggle(o),
  }, mark, el('span', { class: 'opt__label', text: o.label }));

  if (checked) drawStroke(tick.querySelector('path'));
  return btn;
}

/* Arrow keys move within a group of options the way a native radio group
   does, so a keyboard user is not tabbing through thirteen buttons. */
function wireRoving(container, selector = '.opt,.seg') {
  container.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const items = [...container.querySelectorAll(selector)].filter((b) => b.getAttribute('aria-disabled') !== 'true');
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
        : (i + (fwd ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
}

function renderOptions(q, store, on) {
  const value = store.answers[q.id];
  const picked = q.type === 'multi' ? (value || []) : (value ? [value] : []);
  const max = q.max || Infinity;
  const atLimit = q.type === 'multi' && picked.length >= max;

  const list = el('div', {
    class: 'opts',
    role: q.type === 'multi' ? 'group' : 'radiogroup',
    'aria-labelledby': `${q.id}-text`,
  });

  for (const o of store.orderedOptions(q)) {
    const checked = picked.includes(o.id);
    /* An exclusive option is never disabled — choosing it is how you clear the
       rest. Only substantive options lock once the cap is reached. */
    const disabled = !checked && atLimit && !o.exclusive;
    list.append(optionButton(q, o, {
      checked, disabled,
      onToggle: () => on.toggle(q, o),
    }));
  }
  wireRoving(list);

  const frag = el('div', {}, list);

  if (q.max) {
    const note = el('p', {
      class: `opt-note${atLimit ? ' is-limit' : ''}`,
      text: atLimit
        ? `Three selected. Deselect one to choose another.`
        : `Select up to ${q.max}. ${picked.length} selected.`,
    });
    frag.append(note);
  } else if (q.hint === 'Select all that apply.') {
    frag.append(el('p', { class: 'opt-note', text: `${picked.length} selected.` }));
  }

  /* The specification field for "Other", revealed only while it is chosen. */
  const otherOpt = (q.options || []).find((o) => o.other && picked.includes(o.id));
  if (otherOpt) {
    const input = el('input', {
      class: 'field-input', type: 'text', id: `${q.id}-other`,
      maxlength: '160',
      value: store.other[q.id] || '',
      placeholder: 'Your answer',
      oninput: (e) => on.other(q, e.target.value),
    });
    const wrap = el('div', { class: 'other-field' },
      el('label', { for: `${q.id}-other`, text: 'Please specify' }), input);
    frag.append(wrap);
    animate(wrap, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320 });
  }

  return frag;
}

/* ---------- updating a question in place ----------
 *
 * Choosing an option used to go through the full renderer, which replaced the
 * whole section and made every click look like the page reloading. Nothing
 * about a tick actually changes the structure of the screen, so these walk the
 * DOM that is already there and change only what moved. The renderer is still
 * used for the things that genuinely are transitions: a question closing, the
 * next one opening, a new section.
 */

export function syncOptions(node, q, store, on) {
  const list = node.querySelector('.opts');
  if (!list) return false;

  const value = store.answers[q.id];
  const picked = q.type === 'multi' ? (value || []) : (value ? [value] : []);
  const max = q.max || Infinity;
  const atLimit = q.type === 'multi' && picked.length >= max;

  for (const btn of list.querySelectorAll('.opt')) {
    const id = btn.dataset.option;
    const o = (q.options || []).find((x) => x.id === id);
    const checked = picked.includes(id);
    const was = btn.getAttribute('aria-checked') === 'true';
    btn.setAttribute('aria-checked', String(checked));
    /* Only draw the tick when it has just appeared, or it replays on every
       neighbouring click. */
    if (checked && !was) {
      const path = btn.querySelector('.opt__mark path');
      if (path) drawStroke(path);
    }
    const disabled = !checked && atLimit && o && !o.exclusive;
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }

  const note = node.querySelector('.opt-note');
  if (note) {
    if (q.max) {
      note.classList.toggle('is-limit', atLimit);
      note.textContent = atLimit
        ? `${q.max} selected. Deselect one to choose another.`
        : `Select up to ${q.max}. ${picked.length} selected.`;
    } else {
      note.textContent = `${picked.length} selected.`;
    }
  }

  /* The "Other" field appears and disappears with its option. */
  const otherOpt = (q.options || []).find((o) => o.other && picked.includes(o.id));
  const field = node.querySelector('.other-field');
  if (otherOpt && !field) {
    const input = el('input', {
      class: 'field-input', type: 'text', id: `${q.id}-other`, maxlength: '160',
      value: store.other[q.id] || '', placeholder: 'Your answer',
      oninput: (e) => on.other(q, e.target.value),
    });
    const wrap = el('div', { class: 'other-field' },
      el('label', { for: `${q.id}-other`, text: 'Please specify' }), input);
    (note || list).insertAdjacentElement('afterend', wrap);
    animate(wrap, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    input.focus({ preventScroll: true });
  } else if (!otherOpt && field) {
    field.remove();
  }
  return true;
}

export function syncMatrix(node, q, store) {
  const rows = q.type === 'matrix' ? q.rows : store.dynamicRows(q);
  const value = store.answers[q.id] || {};
  const rowNodes = node.querySelectorAll('.matrix__row');
  if (rowNodes.length !== rows.length) return false;

  rows.forEach((r, i) => {
    const rowNode = rowNodes[i];
    rowNode.classList.toggle('is-set', Boolean(value[r.id]));
    [...rowNode.querySelectorAll('.seg')].forEach((seg, j) => {
      seg.setAttribute('aria-checked', String(value[r.id] === q.scale[j].id));
    });
  });

  const done = rows.filter((r) => value[r.id]).length;
  const bar = node.querySelector('.matrix__progress i b');
  if (bar) bar.style.width = `${rows.length ? (done / rows.length) * 100 : 0}%`;
  const label = node.querySelector('.matrix__progress');
  if (label) label.lastChild.textContent = `${done} of ${rows.length} answered`;
  return true;
}

/* ---------- matrix ---------- */

function renderMatrix(q, store, on) {
  const rows = q.type === 'matrix' ? q.rows : store.dynamicRows(q);
  const value = store.answers[q.id] || {};
  const wrap = el('div', { class: 'matrix' });

  rows.forEach((r) => {
    const scale = el('div', {
      class: 'matrix__scale', role: 'radiogroup',
      'aria-labelledby': `${q.id}-${r.id}-label`,
    });
    for (const s of q.scale) {
      scale.append(el('button', {
        type: 'button', class: 'seg', role: 'radio',
        'aria-checked': String(value[r.id] === s.id),
        onclick: () => on.matrix(q, r.id, s.id),
      }, s.label));
    }
    wireRoving(scale);
    wrap.append(el('div', { class: `matrix__row${value[r.id] ? ' is-set' : ''}` },
      el('p', { class: 'matrix__label', id: `${q.id}-${r.id}-label`, text: r.label }),
      scale));
  });

  const done = rows.filter((r) => value[r.id]).length;
  const bar = el('b');
  bar.style.width = `${rows.length ? (done / rows.length) * 100 : 0}%`;
  wrap.append(el('p', { class: 'matrix__progress' },
    el('i', {}, bar), `${done} of ${rows.length} answered`));

  stagger(wrap.querySelectorAll('.matrix__row'), { from: 10, step: 34 });
  return wrap;
}

/* ---------- free text ---------- */

function renderText(q, store, on) {
  const ta = el('textarea', {
    class: 'textarea', id: `${q.id}-input`, maxlength: '1200',
    rows: String(q.rowsHint || 4),
    'aria-labelledby': `${q.id}-text`,
    placeholder: 'Your answer',
    oninput: (e) => { count.textContent = `${e.target.value.length} / 1200`; on.text(q, e.target.value); },
  });
  ta.value = store.answers[q.id] || '';
  const count = el('p', { class: 'char-count', text: `${ta.value.length} / 1200` });
  return el('div', {}, ta, count);
}

/* ---------- country pickers ---------- */

function comboBox(q, store, { multi, on }) {
  const chosen = multi ? (store.answers[q.id] || []) : (store.answers[q.id] ? [store.answers[q.id]] : []);
  const exclusives = q.exclusiveOptions || [];
  const exclusivePicked = chosen.find((id) => exclusives.some((o) => o.id === id));
  const countryPicks = chosen.filter((id) => !exclusives.some((o) => o.id === id));
  const full = multi && countryPicks.length >= (q.max || 3);

  const input = el('input', {
    class: 'field-input', type: 'text', role: 'combobox', id: `${q.id}-input`,
    autocomplete: 'off', spellcheck: 'false',
    'aria-expanded': 'false', 'aria-autocomplete': 'list', 'aria-controls': `${q.id}-list`,
    'aria-labelledby': `${q.id}-text`,
    placeholder: multi ? 'Search countries and territories' : 'Search countries and territories',
  });
  if (!multi && chosen.length) input.value = nameOf(chosen[0]);
  if (full || exclusivePicked) { input.disabled = true; input.placeholder = 'Selection complete'; }

  const list = el('ul', { class: 'combo__list', id: `${q.id}-list`, role: 'listbox', hidden: true });
  const combo = el('div', { class: 'combo' }, input, list);
  let cursor = -1;
  let items = [];

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); cursor = -1; };

  function open(query = '') {
    const tail = multi ? exclusives : [PREFER_NOT_TO_SAY];
    const hits = searchCountries(query, { limit: 40 })
      .filter((c) => !chosen.includes(c.code));
    const tails = tail.filter((t) => {
      const id = t.code || t.id;
      return !chosen.includes(id) && (!query || (t.name || t.label).toLowerCase().includes(query.toLowerCase()));
    });
    items = hits.map((c) => ({ id: c.code, label: c.name, tail: false }))
      .concat(tails.map((t) => ({ id: t.code || t.id, label: t.name || t.label, tail: true })));

    list.replaceChildren();
    if (!items.length) {
      list.append(el('li', { class: 'combo__empty', role: 'presentation', text: 'No match' }));
    } else {
      items.forEach((it, i) => {
        list.append(el('li', {
          role: 'option', id: `${q.id}-opt-${i}`, 'aria-selected': 'false',
          class: it.tail ? 'is-tail' : null,
          onmousedown: (e) => { e.preventDefault(); choose(i); },
        }, it.label));
      });
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    cursor = -1;
  }

  function mark(i) {
    [...list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    if (i >= 0) {
      list.children[i]?.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', `${q.id}-opt-${i}`);
    }
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    close();
    on.country(q, it.id, { multi });
  }

  input.addEventListener('focus', () => open(input.value === nameOf(chosen[0]) ? '' : input.value));
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (list.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) { open(input.value); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = e.key === 'ArrowDown'
        ? Math.min(items.length - 1, cursor + 1)
        : Math.max(0, cursor - 1);
      mark(cursor);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(cursor >= 0 ? cursor : 0);
    }
  });

  const frag = el('div', {}, combo);

  if (multi) {
    const chips = el('div', { class: 'chips' });
    for (const id of chosen) {
      const ex = exclusives.find((o) => o.id === id);
      const x = el('button', { type: 'button', 'aria-label': `Remove ${ex ? ex.label : nameOf(id)}`, onclick: () => on.country(q, id, { multi, remove: true }) });
      x.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      chips.append(el('span', { class: 'chip' }, ex ? ex.label : nameOf(id), x));
    }
    if (chosen.length) frag.append(chips);
    frag.append(el('p', {
      class: `opt-note${full ? ' is-limit' : ''}`,
      text: exclusivePicked ? 'Deselect to choose specific markets.'
        : `Select up to ${q.max || 3}. ${countryPicks.length} selected.`,
    }));

    if (!exclusivePicked) {
      const extra = el('div', { class: 'opts', style: 'margin-top:10px' });
      for (const o of exclusives) {
        extra.append(optionButton({ type: 'multi' }, o, {
          checked: false, disabled: false,
          onToggle: () => on.country(q, o.id, { multi }),
        }));
      }
      frag.append(extra);
    }
  } else if (chosen.length) {
    frag.append(el('p', { class: 'opt-note is-limit', text: `Selected: ${nameOf(chosen[0])}` }));
  }

  return frag;
}

/* A browser with no Intl.DisplayNames would be offered a list of two-letter
   codes. Free text is the honest fallback. */
function renderCountry(q, store, on) {
  if (!COUNTRIES_OK) {
    const input = el('input', {
      class: 'field-input', type: 'text', id: `${q.id}-input`,
      'aria-labelledby': `${q.id}-text`, placeholder: 'Country or territory',
      value: store.answers[q.id] || '',
      oninput: (e) => on.text(q, e.target.value),
    });
    return el('div', {}, input);
  }
  return comboBox(q, store, { multi: q.type === 'country-multi', on });
}

/* ---------- the showcase panel beside Q28 ---------- */

export function renderShowcase(reel) {
  const media = el('div', { class: 'showcase__media' });
  const cap = el('p', { class: 'showcase__cap', text: reel.caption || '' });
  const dots = el('div', { class: 'showcase__dots' });
  const panel = el('div', { class: 'showcase' }, media, el('div', {}, cap, dots));
  reel.mount(media, dots);
  return panel;
}

/* ---------- a question ---------- */

export function renderQuestion(q, store, state, on, extras = {}) {
  const node = el('section', {
    class: `q is-${state}${q.showcase ? ' q--showcase' : ''}`,
    'data-q': q.id,
    /* An upcoming question is readable, not hidden. A sighted respondent can
       see what is coming — that is the point of showing the whole section —
       and a screen reader gets the same. It carries no controls, so there is
       nothing to reach into prematurely; aria-disabled says why. */
    'aria-disabled': state === 'ahead' ? 'true' : null,
  });

  const num = el('p', { class: 'q__num' }, q.id);
  if (q.optional) num.append(el('span', { class: 'q__optional', text: 'Optional' }));
  node.append(num);

  node.append(el('h3', { class: 'q__text', id: `${q.id}-text`, text: q.text }));

  if (state === 'done') {
    const parts = summarise(q, store);
    const p = el('p');
    for (const part of parts) p.append(el('span', { text: part }));
    node.append(el('div', { class: 'q__summary' },
      p,
      el('button', {
        type: 'button', class: 'q__change',
        'aria-label': `Change your answer to ${q.id}`,
        onclick: () => on.edit(q),
      }, 'Change')));
    return node;
  }

  if (state === 'ahead') return node;

  /* active */
  if (q.hint) node.append(el('p', { class: 'q__hint', text: q.hint }));
  if (q.help) node.append(el('p', { class: 'q__help', text: q.help }));

  const body = el('div', { class: 'q__body' });
  let controls;
  if (q.type === 'matrix' || q.type === 'dynamic-matrix') controls = renderMatrix(q, store, on);
  else if (q.type === 'text') controls = renderText(q, store, on);
  else if (q.type === 'country' || q.type === 'country-multi') controls = renderCountry(q, store, on);
  else controls = renderOptions(q, store, on);
  body.append(controls);

  if (q.showcase && extras.reel) body.append(renderShowcase(extras.reel));

  node.append(body);

  if (extras.error) {
    node.classList.add('has-error');
    node.append(el('p', { class: 'error', role: 'alert' }, warnIcon(), extras.error));
  }
  return node;
}

/* ---------- a section screen ---------- */

export function renderSection(section, store, on, extras = {}) {
  const stage = el('div');

  const head = el('div', { class: 'stage__head' },
    el('p', { class: 'eyebrow' },
      `Section ${section.n} of ${extras.sectionCount || 6}`, el('i')),
    el('h2', { class: 'section-title', text: section.title }));

  if (section.intro) {
    const intro = el('div', { class: 'stage__intro' });
    for (const p of section.intro) intro.append(el('p', { text: p }));
    head.append(intro);
  }
  stage.append(head);

  const active = store.activeQuestion(section);
  const forced = extras.editing;
  const openId = forced || (active ? active.id : null);
  const openIndex = section.questions.findIndex((q) => q.id === openId);

  const list = el('div', { class: 'questions' });
  section.questions.forEach((q, i) => {
    let state;
    if (q.id === openId) state = 'active';
    else if (store.settled(q) || (openIndex >= 0 && i < openIndex)) state = 'done';
    else state = 'ahead';
    /* A question before the open one that was never answered (an optional one
       stepped past) still shows as done — with an explicit "not answered". */
    if (state === 'done' && !store.hasResponse(q)) {
      list.append(renderSkipped(q, on));
      return;
    }
    list.append(renderQuestion(q, store, state, on, {
      reel: extras.reel,
      error: extras.errors?.[q.id],
    }));
  });
  stage.append(list);
  return stage;
}

function renderSkipped(q, on) {
  return el('section', { class: 'q is-done', 'data-q': q.id },
    el('p', { class: 'q__num' }, q.id, el('span', { class: 'q__optional', text: 'Optional' })),
    el('h3', { class: 'q__text', text: q.text }),
    el('div', { class: 'q__summary' },
      el('p', {}, el('span', { text: 'Not answered' })),
      el('button', { type: 'button', class: 'q__change', onclick: () => on.edit(q) }, 'Answer')));
}

/* ---------- the section rail ---------- */

export function renderRail(progress, on) {
  const ol = el('ol');
  progress.forEach((s, i) => {
    const reachable = s.done > 0 || s.current || progress.slice(0, i).every((p) => p.done === p.total);
    ol.append(el('li', {
      class: [
        s.done === s.total && s.total > 0 ? 'is-done' : '',
        s.current ? 'is-current' : '',
      ].filter(Boolean).join(' '),
      'aria-disabled': reachable ? null : 'true',
      'aria-current': s.current ? 'step' : null,
    }, el('button', {
      type: 'button',
      onclick: () => on.jump(i),
    }, el('em', { text: String(s.n).padStart(2, '0') }), el('span', { text: s.title }))));
  });
  return ol;
}

export { bringIntoView, animate, stagger, EASE };
