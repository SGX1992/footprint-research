/* The answer store.
 *
 * Holds three things and derives everything else: what was answered, the
 * per-respondent option order, and where in the questionnaire we are. Routing
 * is recomputed from the answers on every change rather than tracked as a
 * separate cursor, so there is no second version of the truth to fall out of
 * step.
 *
 * Answers survive Back and a reload within the same tab, and no further —
 * sessionStorage, not localStorage: a shared machine must not hand the next
 * person a half-finished questionnaire.
 */

import { SECTIONS, ALL_QUESTIONS, ROUTING, isApplicable, dynamicRows, SCREEN_OUT_OPTION } from './questionnaire.js?v=20260910120425';
import { STUDY } from './config.js?v=20260910120425';

/* Namespaced by study and version: two editions on the same host never
   collide, and a version bump abandons the old draft rather than restoring
   answers into a questionnaire that has changed under them. */
const KEY = `research:${STUDY.id}:${STUDY.version}`;

/* Answer shapes, by question type:
     single          option id (string)
     multi           array of option ids
     matrix          { [rowId]: scaleId }
     dynamic-matrix  { [rowId]: scaleId }
     text            string
     country         country code (string)
     country-multi   array of country codes and/or exclusive option ids
   Absent key = unanswered. */

export function createStore() {
  let answers = {};
  let other = {};      // questionId -> the "Other [please specify]" text
  let order = {};      // questionId -> option ids, in this respondent's order
  let advanced = {};   // questions the respondent has explicitly stepped past
  let sectionIndex = 0;
  let listeners = [];

  /* ---------- option order ---------- */

  /* Randomized once per respondent and then frozen, so navigating back shows
     the same list in the same order. Tail options never move. */
  function optionOrder(q) {
    if (!q.options) return null;
    if (order[q.id]) return order[q.id];
    const head = q.options.filter((o) => !o.tail);
    const tail = q.options.filter((o) => o.tail);
    if (q.randomize !== false) {
      for (let i = head.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [head[i], head[j]] = [head[j], head[i]];
      }
    }
    order[q.id] = head.concat(tail).map((o) => o.id);
    return order[q.id];
  }

  function orderedOptions(q) {
    if (!q.options) return [];
    const ids = optionOrder(q);
    const map = new Map(q.options.map((o) => [o.id, o]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }

  /* ---------- routing ---------- */

  const applicable = (q) => isApplicable(q, answers);

  function applicableQuestions() {
    return ALL_QUESTIONS.filter(applicable);
  }

  /* A section is one screen. Its questions arrive in step order with the
     inapplicable ones removed, and a section that routing empties out
     disappears from the route rather than showing an empty screen. */
  function applicableSections() {
    return SECTIONS
      .map((s) => ({
        ...s,
        questions: s.steps.flatMap((st) => st.questions).filter(applicable),
      }))
      .filter((s) => s.questions.length > 0);
  }

  /* Whatever the last change made unreachable is removed, not left behind to
     be submitted as an answer to a question this respondent never saw. Q10 is
     the awkward case: its rows come from Q09, so a Q09 edit can invalidate
     part of an answer rather than all of it. */
  function prune() {
    for (const q of ALL_QUESTIONS) {
      if (ROUTING[q.id] && !applicable(q)) {
        delete answers[q.id];
        delete other[q.id];
        delete advanced[q.id];
      }
    }
    if (answers.Q10) {
      const live = new Set(dynamicRows({ rowsFrom: 'Q09' }, answers, other).map((r) => r.id));
      for (const rowId of Object.keys(answers.Q10)) {
        if (!live.has(rowId)) delete answers.Q10[rowId];
      }
      if (Object.keys(answers.Q10).length === 0) delete answers.Q10;
    }
    /* An "Other" text is meaningless once its option is deselected. */
    for (const q of ALL_QUESTIONS) {
      if (other[q.id] === undefined) continue;
      const v = answers[q.id];
      const picked = Array.isArray(v) ? v : [v];
      const stillOther = (q.options || []).some((o) => o.other && picked.includes(o.id));
      if (!stillOther) delete other[q.id];
    }
  }

  /* ---------- completeness ---------- */

  /* Choosing "Other" is only half an answer. Until the specification is typed
     the question stays open — which is also why this is checked by
     hasResponse: the cascade must not move on and leave an empty field
     behind. */
  function otherSatisfied(q) {
    const v = answers[q.id];
    const picked = Array.isArray(v) ? v : [v];
    const needs = (q.options || []).some((o) => o.other && picked.includes(o.id));
    return !needs || Boolean((other[q.id] || '').trim());
  }

  function isAnswered(q) {
    const v = answers[q.id];
    if (q.optional) return true;
    if (!otherSatisfied(q)) return false;
    switch (q.type) {
      case 'multi':
      case 'country-multi':
        return Array.isArray(v) && v.length > 0;
      case 'matrix':
        return v && q.rows.every((r) => v[r.id]);
      case 'dynamic-matrix': {
        const rs = dynamicRows(q, answers, other);
        return v && rs.length > 0 && rs.every((r) => v[r.id]);
      }
      case 'text':
        return typeof v === 'string' && v.trim().length > 0;
      default:
        return typeof v === 'string' && v.length > 0;
    }
  }

  /* Answered in the ordinary sense — used for the progress rail and for the
     cascade, where an optional question left blank must not light up the next
     one as though it had been dealt with. */
  function hasResponse(q) {
    const v = answers[q.id];
    if (v === undefined || v === null) return false;
    if (!otherSatisfied(q)) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).trim().length > 0;
  }

  function missingIn(section) {
    return section.questions.filter((q) => applicable(q) && !isAnswered(q));
  }

  /* Which questions may close themselves the moment they have an answer.
     A single choice is unambiguous — one tap and you are done, and moving on
     is the whole point of the cascade. A matrix is done when its last row is
     filled. Everything else (pick up to three, select all that apply, free
     text) has no such moment: the respondent decides when they have finished,
     so those wait for an explicit step. Without this, one tick on a
     "select up to three" would close the question at one answer, and an
     optional written question with nothing typed would never settle at all,
     stranding every question after it. */
  function autoAdvances(q) {
    return q.type === 'single' || q.type === 'country'
      || q.type === 'matrix' || q.type === 'dynamic-matrix';
  }

  function settled(q) {
    if (advanced[q.id]) return true;
    /* isAnswered, not hasResponse: a matrix has "a response" the moment one
       row is filled, and settling on that collapsed the question after the
       first row and left the section quietly incomplete. It is only finished
       when every row is. */
    return autoAdvances(q) && hasResponse(q) && isAnswered(q);
  }

  /* The one question a section screen has open. Everything before it is
     collapsed to a summary; everything after is greyed out. */
  function activeQuestion(section) {
    return section.questions.find((q) => !settled(q)) || null;
  }

  /* ---------- public surface ---------- */

  const api = {
    get answers() { return answers; },
    get other() { return other; },
    get sectionIndex() { return sectionIndex; },

    sections: applicableSections,
    orderedOptions,
    dynamicRows: (q) => dynamicRows(q, answers, other),
    isAnswered,
    hasResponse,
    otherSatisfied,
    settled,
    autoAdvances,
    missingIn,

    screenedOut: () => answers.Q01 === SCREEN_OUT_OPTION,

    setAnswer(qid, value) {
      if (value === undefined) delete answers[qid];
      else answers[qid] = value;
      prune();
      save();
      emit();
    },

    setOther(qid, text) {
      if (text) other[qid] = text;
      else delete other[qid];
      save();
      emit();
    },

    activeQuestion,

    /* Stepping past a question the respondent controls. Re-opening one for
       editing un-steps it, so it stays open until they move on again. */
    advance(qid) { advanced[qid] = true; save(); emit(); },
    reopen(qid) { delete advanced[qid]; save(); emit(); },

    goTo(i) {
      const list = applicableSections();
      sectionIndex = Math.max(0, Math.min(list.length - 1, i));
      save();
      emit();
    },

    currentSection() {
      const list = applicableSections();
      return list[Math.min(sectionIndex, list.length - 1)];
    },

    /* Progress is measured against the route this respondent is actually on,
       so a skipped section does not leave the bar stranded. It is an estimate
       while routing questions are still unanswered, and it is allowed to move
       backwards — that is honest, and better than a bar that lies to keep
       going up. */
    progress() {
      const qs = applicableQuestions();
      const done = qs.filter(hasResponse).length;
      return { done, total: qs.length, ratio: qs.length ? done / qs.length : 0 };
    },

    sectionProgress() {
      const live = applicableSections();
      const here = live[Math.min(sectionIndex, live.length - 1)];
      return live.map((s) => ({
        id: s.id, n: s.n, title: s.title,
        total: s.questions.length,
        done: s.questions.filter(hasResponse).length,
        current: here ? here.id === s.id : false,
      }));
    },

    onChange(fn) { listeners.push(fn); },

    /* The submission payload. Every question appears — a question the route
       never reached is recorded as a skip, which is a different fact from an
       optional question left blank, and both differ from "Don't know". */
    payload() {
      const responses = ALL_QUESTIONS.map((q) => {
        if (!applicable(q)) {
          return { id: q.id, status: 'skipped_by_routing' };
        }
        if (!hasResponse(q)) {
          return { id: q.id, status: q.optional ? 'not_answered_optional' : 'unanswered' };
        }
        const entry = { id: q.id, status: 'answered', type: q.type, value: answers[q.id] };
        if (q.type === 'dynamic-matrix') {
          entry.rows = dynamicRows(q, answers, other).map((r) => ({ id: r.id, label: r.label }));
        }
        if (other[q.id]) entry.other = other[q.id];
        return entry;
      });
      return {
        study: STUDY.id,
        version: STUDY.version,
        submittedAt: new Date().toISOString(),
        eligible: answers.Q01 !== SCREEN_OUT_OPTION,
        responses,
      };
    },

    reset() {
      answers = {}; other = {}; order = {}; advanced = {}; sectionIndex = 0;
      try { sessionStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
      emit();
    },
  };

  function emit() { for (const fn of listeners) fn(api); }

  function save() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ answers, other, order, advanced, sectionIndex }));
    } catch {
      /* Private mode, blocked storage, quota — the questionnaire still works
         for the length of this page view, which is what matters. */
    }
  }

  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      answers = saved.answers || {};
      other = saved.other || {};
      order = saved.order || {};
      advanced = saved.advanced || {};
      sectionIndex = saved.sectionIndex || 0;
      prune();
    }
  } catch { /* ignore an unreadable or stale entry */ }

  return api;
}
