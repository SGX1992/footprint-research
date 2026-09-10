/* Wiring.
 *
 * Owns the three screens (landing, questionnaire, end), the handlers the
 * renderer calls back into, and the one decision that matters most: what the
 * page is allowed to claim about whether an answer was saved.
 */

import { STUDY, PRIVACY_URL, DURATION_ESTIMATE, CONTACT_URL, BENEFITS, BRAND, THANKS } from './config.js?v=20260910120425';
import { createStore } from './state.js?v=20260910120425';
import { createSubmitter, probe } from './submit.js?v=20260910120425';
import { renderSection, renderRail, el, bringIntoView, animate, stagger, syncOptions, syncMatrix } from './ui.js?v=20260910120425';
import { revealWords, reduced, EASE } from './motion.js?v=20260910120425';

const $ = (id) => document.getElementById(id);

const store = createStore();
const submitter = createSubmitter();

let editing = null;      // a question id forced open by "Change"
let errors = {};
let backend = { live: false, reason: 'not checked' };
/* The last question the renderer opened, so its reveal plays once. */
let lastOpened = null;

/* No speaker reel in this edition — the DDX build has one beside its final
   question; here the questionnaire is short enough not to need the
   encouragement. The renderer only draws the panel when it is handed a reel,
   so passing nothing is all it takes.  */

const reel = null;

/* ============================================================ landing */

function bootLanding() {
  $('studyTitle').textContent = STUDY.title;
  if (STUDY.theme) $('heroDeck').textContent = STUDY.theme;
  document.title = `${STUDY.title} — ${BRAND.research}`;

  /* The privacy notice is a launch requirement, and until its URL is set the
     page says exactly that rather than linking nowhere. */
  /* The time claim appears beside the button, where the decision is made. */
  const time = $('ctaTime');
  if (DURATION_ESTIMATE) time.textContent = `Takes about ${DURATION_ESTIMATE}`;
  else time.hidden = true;

  const list = $('benefitsList');
  if (!list) return;
  list.replaceChildren(...BENEFITS.map((b) => el('li', {},
    el('b', { text: b.title }), el('p', { text: b.body }))));

  /* The accent rules draw across as each one comes into view — the only
     scroll-triggered motion on the page, and it degrades to "already drawn"
     without an observer or with reduced motion. */
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        setTimeout(() => e.target.classList.add('is-in'), i * 110);
        io.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    list.querySelectorAll('li').forEach((li) => io.observe(li));
  } else {
    list.querySelectorAll('li').forEach((li) => li.classList.add('is-in'));
  }

  const meta = $('beginMeta');
  meta.replaceChildren();
  if (DURATION_ESTIMATE) meta.append(`Takes about ${DURATION_ESTIMATE}. `);
  if (PRIVACY_URL) {
    meta.append('How we handle your responses: ');
    meta.append(el('a', { href: PRIVACY_URL, rel: 'noopener' }, 'Privacy notice'));
    meta.append('.');
  } else {
    meta.append(el('span', {
      class: 'privacy-missing',
      title: 'Set PRIVACY_URL in assets/js/config.js before launch.',
    }, 'Privacy notice — not yet published'));
  }

  const rule = $('heroRule');
  animate(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
    { duration: 780, delay: 180, easing: EASE.out });
  revealWords($('heroHeadline'), { delay: 300, step: 52 });
  stagger([$('studyTitle'), document.querySelector('.hero__deck'), document.querySelector('.cta-row')],
    { delay: 120, step: 130, from: 16 });

  for (const id of ['startBtn', 'startBtn2']) $(id)?.addEventListener('click', startSurvey);
}

/* ============================================================ questionnaire */

/* The wordmark goes back to the landing screen. Nothing is discarded — the
   answers are still in the session — so the primary button changes to "Resume"
   rather than inviting someone to start again from nothing. */
function goHome() {
  reel?.stop?.();
  $('survey').hidden = true;
  $('done').hidden = true;
  $('landing').hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
  syncStartLabel();
  $('startBtn')?.focus?.({ preventScroll: true });
}

function syncStartLabel() {
  const label = $('startLabel');
  if (!label) return;
  const { done } = store.progress();
  label.textContent = done > 0 ? 'Resume the survey' : 'Take the survey';
}

function startSurvey() {
  $('landing').hidden = true;
  $('done').hidden = true;
  $('survey').hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
  render();
  $('survey').focus?.();
}

function currentSection() { return store.currentSection(); }

/* Which question is open on the current screen — the one being edited, or the
   first the cascade has not settled. */
function openQuestionId(section) {
  return editing || store.activeQuestion(section)?.id || null;
}

/* Update the open question where it stands. Returns false when the change is a
   real transition — the question has closed, or a different one opened — and
   the renderer should take over. */
function patchOpen(q) {
  const section = currentSection();
  if (openQuestionId(section) !== q.id) return false;
  const node = $('stage').querySelector(`[data-q="${q.id}"]`);
  if (!node || !node.classList.contains('is-active')) return false;
  const ok = (q.type === 'matrix' || q.type === 'dynamic-matrix')
    ? syncMatrix(node, q, store)
    : syncOptions(node, q, store, handlers);
  if (ok) refreshChrome();
  return ok;
}

const handlers = {
  toggle(q, o) {
    errors = {};
    if (q.type === 'multi') {
      const cur = store.answers[q.id] || [];
      const has = cur.includes(o.id);
      let next;
      if (o.exclusive) {
        next = has ? [] : [o.id];
      } else {
        /* Any substantive pick clears an exclusive one — they cannot coexist. */
        const cleaned = cur.filter((id) => !(q.options.find((x) => x.id === id)?.exclusive));
        next = has ? cleaned.filter((id) => id !== o.id) : cleaned.concat(o.id);
        if (q.max && next.length > q.max) return;
      }
      store.setAnswer(q.id, next.length ? next : undefined);
    } else {
      store.setAnswer(q.id, store.answers[q.id] === o.id ? undefined : o.id);
      /* Answering Q01 with the final option ends the questionnaire here. */
      if (q.id === 'Q01' && store.screenedOut()) { showIneligible(); return; }
    }
    if (editing === q.id && store.settled(q)) editing = null;
    if (patchOpen(q)) return;
    render({ focus: q.id });
  },

  matrix(q, rowId, scaleId) {
    errors = {};
    const cur = { ...(store.answers[q.id] || {}) };
    if (cur[rowId] === scaleId) delete cur[rowId];
    else cur[rowId] = scaleId;
    store.setAnswer(q.id, Object.keys(cur).length ? cur : undefined);
    if (editing === q.id && store.settled(q)) editing = null;
    if (patchOpen(q)) return;
    render({ focus: q.id, keepScroll: true });
  },

  /* Typing must not re-render — that would move the caret. The store is
     updated and only the derived chrome is refreshed. */
  text(q, value) {
    store.setAnswer(q.id, value.trim() ? value : undefined);
    refreshChrome();
  },
  other(q, value) {
    store.setOther(q.id, value);
    refreshChrome();
  },

  country(q, id, { multi, remove } = {}) {
    errors = {};
    if (!multi) {
      store.setAnswer(q.id, id);
      if (editing === q.id) editing = null;
      render({ focus: q.id });
      return;
    }
    const cur = store.answers[q.id] || [];
    const exclusiveIds = (q.exclusiveOptions || []).map((o) => o.id);
    let next;
    if (remove) next = cur.filter((x) => x !== id);
    else if (exclusiveIds.includes(id)) next = [id];
    else {
      const cleaned = cur.filter((x) => !exclusiveIds.includes(x));
      if (cleaned.includes(id)) next = cleaned;
      else if (cleaned.length >= (q.max || 3)) return;
      else next = cleaned.concat(id);
    }
    store.setAnswer(q.id, next.length ? next : undefined);
    if (editing === q.id && store.settled(q)) editing = null;
    render({ focus: q.id });
  },

  edit(q) {
    editing = q.id;
    errors = {};
    store.reopen(q.id);
    render({ focus: q.id, scrollTo: q.id });
  },

  jump(i) {
    editing = null;
    errors = {};
    store.goTo(i);
    render({ top: true });
  },
};

function refreshChrome() {
  const p = store.progress();
  $('progressFill').style.width = `${Math.round(p.ratio * 100)}%`;
  $('topCount').textContent = `${p.done} of ${p.total}`;
  updateControls();
  const meter = document.querySelector('.rail__meter b');
  if (meter) meter.textContent = `${Math.round(p.ratio * 100)}%`;
}

function updateControls() {
  const list = store.sections();
  const section = currentSection();
  const lastSection = store.sectionIndex >= list.length - 1;
  const open = section ? (editing || store.activeQuestion(section)?.id) : null;
  const missing = section ? store.missingIn(section) : [];

  /* Only says Submit when there is genuinely nothing left to answer — the
     button never promises to finish while a question is still open. */
  $('nextBtn').textContent = lastSection && !open && missing.length === 0
    ? 'Submit responses'
    : 'Continue';
  $('backBtn').hidden = store.sectionIndex === 0;
  $('controlStatus').textContent = missing.length === 0
    ? (lastSection && !open ? 'All sections answered.' : '')
    : `${missing.length} question${missing.length > 1 ? 's' : ''} left in this section.`;
}

function render({ focus, scrollTo, top, keepScroll } = {}) {
  const section = currentSection();
  if (!section) return;
  const y = window.scrollY;

  const stage = $('stage');
  stage.replaceChildren(renderSection(section, store, handlers, {
    editing,
    errors,
    reel,
    sectionCount: store.sections().length,
  }));

  const rail = $('rail');
  rail.replaceChildren(renderRail(store.sectionProgress(), handlers),
    el('div', { class: 'rail__meter' },
      el('b', { text: `${Math.round(store.progress().ratio * 100)}%` }),
      el('span', { text: 'complete' })));

  refreshChrome();

  const active = stage.querySelector('.q.is-active');
  if (active && active.dataset.q !== lastOpened) {
    stagger(active.querySelectorAll('.opt,.matrix__row,.textarea,.combo'), { from: 8, step: 26, duration: 380 });
  }
  lastOpened = active ? active.dataset.q : null;

  if (top) { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return; }
  if (keepScroll) { window.scrollTo({ top: y, behavior: 'auto' }); return; }

  const target = stage.querySelector(scrollTo ? `[data-q="${scrollTo}"]` : '.q.is-active');
  if (target) bringIntoView(target);
  if (focus && active) active.querySelector('.opt,.seg,.textarea,input')?.focus?.({ preventScroll: true });
}

/* The single forward action. There used to be two — a "Next" inside the open
   question and a "Continue" in the bar — which put two buttons meaning the same
   thing on screen at once. Now one button in one fixed place always means
   forward: it finishes the open question, and if that was the last one in the
   section it goes straight on to the next section rather than making you press
   again. */
function next() {
  let section = currentSection();
  const openId = editing || store.activeQuestion(section)?.id;

  if (openId) {
    const q = section.questions.find((x) => x.id === openId);
    if (q && !q.optional && !store.isAnswered(q)) {
      errors = { [q.id]: messageFor(q) };
      editing = q.id;
      render({ scrollTo: q.id });
      return;
    }
    errors = {};
    editing = null;
    if (q) store.advance(q.id);
    section = currentSection();
    /* Another question opened behind it — that is this press's whole job. */
    if (store.activeQuestion(section)) { render({ focus: true }); return; }
  }

  /* Nothing open: the section is done. A question edited after the fact can
     still be incomplete, so check before moving on. */
  const missing = store.missingIn(section);
  if (missing.length) {
    const first = missing[0];
    errors = { [first.id]: messageFor(first) };
    editing = first.id;
    render({ scrollTo: first.id });
    return;
  }

  const list = store.sections();
  if (store.sectionIndex >= list.length - 1) { finish(); return; }
  editing = null;
  errors = {};
  store.goTo(store.sectionIndex + 1);
  render({ top: true });
}

function messageFor(q) {
  if (!store.otherSatisfied(q)) return 'Please describe your “Other” answer.';
  if (q.type === 'matrix' || q.type === 'dynamic-matrix') return 'Please answer every row before continuing.';
  if (q.type === 'multi' || q.type === 'country-multi') return 'Please select at least one option.';
  return 'Please answer this question before continuing.';
}

function back() {
  editing = null;
  errors = {};
  if (store.sectionIndex === 0) { goHome(); return; }
  store.goTo(store.sectionIndex - 1);
  render({ top: true });
}

/* ============================================================ end states */

function showEnd(node) {
  reel?.stop();
  $('survey').hidden = true;
  $('landing').hidden = true;
  const done = $('done');
  $('doneBody').replaceChildren(node);
  done.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
  stagger($('doneBody').children, { from: 18, step: 90 });
}

function showIneligible() {
  showEnd(el('div', { class: 'ineligible' },
    el('p', { class: 'eyebrow', text: STUDY.eyebrow }),
    el('h2', { class: 'display', style: 'font-size:clamp(1.9rem,4vw,2.8rem)', text: 'Thank you for your interest.' }),
    el('p', { class: 'lede', style: 'color:rgba(255,255,255,.78)' }, STUDY.screenOutMessage || ''),
    el('p', { class: 'fine', style: 'margin-top:26px;color:rgba(255,255,255,.5)' },
      'Your answers have not been recorded.')));
}

async function finish() {
  const btn = $('nextBtn');
  btn.classList.add('is-sending');
  btn.textContent = 'Submitting…';
  btn.setAttribute('aria-busy', 'true');

  const payload = store.payload();
  try {
    if (!backend.live) throw new Error(backend.reason || 'No submission service is configured.');
    await submitter.submit(payload);
    showThankYou();
  } catch (err) {
    btn.classList.remove('is-sending');
    btn.removeAttribute('aria-busy');
    btn.textContent = 'Try again';
    showSubmitError(err.message, payload);
  }
}

/* A failure must not cost someone fifteen minutes of work. The answers stay in
   the page, the button retries, and the payload can be downloaded and sent to
   us by hand. */
function showSubmitError(message, payload) {
  const holder = $('stage');
  const existing = holder.querySelector('.notice--error');
  existing?.remove();

  const download = el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${STUDY.id}-responses-${STUDY.version}.json` });
    document.body.append(a); a.click(); a.remove();
  } }, 'Download my answers');

  const notice = el('div', { class: 'notice notice--error', role: 'alert' },
    el('div', {},
      el('b', { text: 'Your responses were not saved.' }),
      el('p', { style: 'margin-top:6px', text: message }),
      el('p', { style: 'margin-top:6px' }, 'Your answers are still on this page. Use Try again, or download them and send them to ',
        el('a', { href: CONTACT_URL, rel: 'noopener' }, BRAND.short), '.'),
      el('div', { style: 'margin-top:14px' }, download)));
  holder.prepend(notice);
  bringIntoView(notice, { top: 0.2 });
}

function showThankYou() {
  const body = el('div', {});
  body.append(
    el('p', { class: 'eyebrow', text: STUDY.eyebrow }),
    el('h2', { class: 'display', style: 'font-size:clamp(2rem,4.6vw,3.2rem)', text: THANKS.title }),
    el('p', { class: 'lede', style: 'color:rgba(255,255,255,.78)' },
      THANKS.body),
  );
  body.append(contactForm());
  showEnd(body);
}

/* Deliberately a second, separate act: two unchecked boxes, and an email field
   that only appears once one of them is ticked. Nothing here can affect the
   response that has already been stored. */
function contactForm() {
  const state = { report: false, interview: false };

  const emailWrap = el('div', { class: 'contact__email', hidden: true });
  const email = el('input', {
    class: 'field-input', type: 'email', id: 'contactEmail',
    autocomplete: 'email', placeholder: 'you@organization.com',
    'aria-label': 'Email address',
  });
  emailWrap.append(el('label', { for: 'contactEmail', class: 'sr-only', text: 'Email address' }), email);

  const save = el('button', { class: 'btn', type: 'button', disabled: true }, 'Save my preferences');
  const status = el('p', { class: 'contact__note', role: 'status' });

  function sync() {
    const any = state.report || state.interview;
    emailWrap.hidden = !any;
    save.disabled = !any;
    if (any) animate(emailWrap, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320 });
  }

  const box = (key, label) => {
    const input = el('input', { type: 'checkbox', onchange: (e) => { state[key] = e.target.checked; sync(); } });
    const mark = el('span', { class: 'check__box' });
    mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg>';
    return el('label', { class: 'check' }, input, mark, el('span', { text: label }));
  };

  save.addEventListener('click', async () => {
    const value = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      status.textContent = 'Please enter an email address we can reach you at.';
      email.focus();
      return;
    }
    save.classList.add('is-sending');
    save.textContent = 'Saving…';
    try {
      if (!backend.live) throw new Error(backend.reason || 'No submission service is configured.');
      await submitter.contact({ email: value, report: state.report, interview: state.interview });
      save.classList.remove('is-sending');
      save.replaceWith(el('p', { class: 'lede', style: 'color:#fff', text: 'Saved. Thank you.' }));
      status.textContent = 'Your survey response and these preferences are stored separately.';
    } catch (err) {
      save.classList.remove('is-sending');
      save.textContent = 'Try again';
      status.textContent = `Not saved — ${err.message}`;
    }
  });

  const form = el('div', { class: 'contact' },
    el('h3', { text: 'Stay connected to the research' }),
    el('p', { text: 'Optional, and separate from your survey response.' }),
    box('report', 'Send me the report when it is published.'),
    box('interview', 'Contact me about a follow-up research interview.'),
    emailWrap,
    el('div', { class: 'contact__actions' }, save),
    status);

  if (!backend.live) {
    form.append(el('div', { class: 'notice notice--preview' },
      el('span', { text: 'Preview — no submission service is configured, so preferences cannot be saved.' })));
  }
  return form;
}

/* ============================================================ boot */

function flagPreview() {
  /* Prepended, not appended: it belongs above everything, in the flow. */
  document.body.classList.add('is-preview');
  document.body.prepend(el('div', {
    class: 'preview-flag',
    title: backend.reason || '',
  }, 'Preview — responses are not being saved'));

  /* And again where the decision to start is actually made. A bar at the top
     of the page is easy to scroll past; nobody should discover that their
     answers were not kept only after spending the time to give them. */
  for (const id of ['startBtn', 'startBtn2']) {
    const btn = $(id);
    if (!btn) continue;
    const note = el('p', { class: 'cta-warning' },
      el('b', { text: 'Not collecting responses yet.' }),
      ' You can go through the whole survey, but nothing will be saved.');
    /* Appended to the row rather than dropped in after the button: as the last
       flex item it takes its own line underneath, instead of pushing the time
       pill and the supporting text onto one of their own. */
    (btn.closest('.cta-row') || btn.parentElement).append(note);
  }
}

async function boot() {
  /* The browser would otherwise restore the scroll position from the last
     visit and drop a returning respondent halfway down the landing page, or
     part-way through a section. Where they belong is decided below, by whether
     there are answers to come back to. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  bootLanding();
  $('nextBtn').addEventListener('click', next);
  $('backBtn').addEventListener('click', back);
  $('homeBtn')?.addEventListener('click', goHome);
  syncStartLabel();

  backend = await probe();
  if (!backend.live) flagPreview();

  /* A reload mid-questionnaire lands back where it left off rather than at the
     landing page, because sessionStorage still has the answers. */
  if (Object.keys(store.answers).length > 0 && !store.screenedOut()) startSurvey();
}

boot();
