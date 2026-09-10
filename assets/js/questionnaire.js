/* The questionnaire, as data.
 *
 * Eight questions, taken from the Footprint Intelligence research form. The
 * interface hard-codes none of it: a revision is a diff against this file plus
 * a version bump in config.js.
 *
 * Question ids are stable and gapless, F01–F08. There is no routing in this
 * edition — every respondent sees every question — but the machinery is the
 * same as the DDX build, so a branch can be added without restructuring.
 *
 * A `step` is one screen. Each holds a single question.
 */

const slug = (s) =>
  s.toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 44);

/* A substantive option: randomized with its peers, freely combinable. */
const O = (label, notion) => ({ id: slug(label), label, notion });

/* "Other" sits at the bottom, combines with the rest, and opens a short text
   field. */
const OTHER = { id: 'other', label: 'Other [please specify]', tail: true, other: true, notion: 'Other' };

const Q = {
  F01: {
    id: 'F01', type: 'single', notionProp: 'F01 Role',
    text: 'Which function best describes your role?',
    options: [
      O('Sustainability / ESG / CSR'),
      O('Executive Management / Strategy'),
      O('Finance / Controlling'),
      O('Procurement / Supply Chain'),
      O('Operations'),
      O('Risk / Compliance / Legal'),
      O('Communications / Marketing'),
      O('IT / Data'),
      OTHER,
    ],
  },

  F02: {
    id: 'F02', type: 'multi', max: 3, notionProp: 'F02 Collaborations',
    text: 'Which cross-functional collaborations are becoming increasingly important for your sustainability work?',
    options: [
      O('Finance / Controlling'),
      O('Procurement / Supply Chain'),
      O('Operations'),
      O('IT / Data'),
      O('Strategy / Management'),
      O('Risk / Compliance / Legal'),
      O('Product / Innovation'),
      O('Sales / Customer Management'),
      O('Communications / Marketing'),
      OTHER,
    ],
  },

  F03: {
    id: 'F03', type: 'multi', max: 3, notionProp: 'F03 Urgent topics',
    text: 'Which sustainability topics are currently most urgent for your team?',
    options: [
      O('Carbon accounting / Scope 1-3'),
      O('Data collection & data quality'),
      O('CSRD / ESG reporting & disclosures'),
      O('Scope 3 data & supplier engagement'),
      O('Decarbonization'),
      O('Strategy & performance management'),
      O('Regulatory readiness & compliance'),
      O('Product sustainability / PCF / LCA / Circularity'),
      OTHER,
    ],
  },

  F04: {
    id: 'F04', type: 'multi', max: 3, notionProp: 'F04 Barriers',
    text: 'What are the biggest barriers preventing your team from making faster progress?',
    options: [
      O('Fragmented or inconsistent data'),
      O('Limited supplier data'),
      O('Too much manual work'),
      O('Lack of process standardization'),
      /* The source form reads "responsibilites". Corrected here — a misspelling
         in a question is the kind of thing a respondent notices instead of the
         question. */
      O('Unclear responsibilities or ownership'),
      O('Limited internal capacity or budget'),
      O('Difficulty demonstrating business value'),
      O('Unclear regulatory requirements or priorities'),
      O('Limited management buy-in'),
      OTHER,
    ],
  },

  F05: {
    id: 'F05', type: 'multi', max: 3, notionProp: 'F05 Time and resources',
    text: 'Which activities currently require the most time and resources?',
    options: [
      O('Collecting internal data'),
      O('Collecting supplier / Scope 3 data'),
      O('Validating and consolidating data'),
      O('Coordinating across departments'),
      O('Preparing reports and disclosures'),
      O('Responding to audits and questionnaires'),
      O('Developing strategy targets and transition plans'),
      O('Implementing and tracking measures'),
      O('Monitoring regulatory requirements'),
      OTHER,
    ],
  },

  F06: {
    id: 'F06', type: 'multi', max: 3, notionProp: 'F06 Business value',
    text: 'Where could sustainability create more business value within your organization?',
    options: [
      O('Cost reduction and efficiency'),
      O('Risk management and resilience'),
      O('Customer and tender success'),
      O('Supply chain performance'),
      O('Product development and innovation'),
      O('Investment and strategic planning'),
      O('Market positioning and reputation'),
      O('Regulatory readiness'),
      O('Decision-making processes'),
      OTHER,
    ],
  },

  F07: {
    id: 'F07', type: 'multi', max: 3, notionProp: 'F07 AI value',
    text: 'Where do you expect AI to create the most value in your sustainability work?',
    options: [
      O('Automating data collection and preparation'),
      O('Improving supplier and Scope 3 workflows'),
      O('Structuring and validating sustainability data'),
      O('Supporting carbon calculations and footprinting'),
      O('Preparing reports and disclosures'),
      O('Interpreting regulatory requirements and changes'),
      O('Identifying decarbonization opportunities and measures'),
      O('Scenario modelling and forecasting'),
      O('Generating management insights and decision support'),
      OTHER,
    ],
  },

  /* The closing question, and the one worth quoting. It replaces the source
     form's "which challenge is underestimated" — the two overlapped heavily,
     and this framing asks for a view rather than a gap. */
  F08: {
    id: 'F08', type: 'text', optional: true, rowsHint: 5,
    notionProp: 'F08 Future of corporate sustainability',
    text: 'What is your perspective on the future of corporate sustainability — and which key challenges do we have to overcome?',
    help: 'Suggested length: 2–4 sentences. With your permission we may quote contributions like this in the published report.',
  },
};

/* ---------- sections and screens ---------- */

export const SECTIONS = [
  {
    /* Read immediately before answering rather than on the landing page,
       where these three paragraphs stood between someone and the start
       button. */
    intro: [
      'Please answer for one organization or business unit you know directly, and keep that same scope throughout. Consultants and advisors may answer for one client organization without identifying the client.',
      'Throughout this survey, “your team” means the people responsible for sustainability work in that organization, wherever they sit.',
      'Participation is voluntary. Please do not include confidential information, supplier names or anything commercially sensitive.',
    ],
    n: 1, id: 'you', title: 'You and your team',
    steps: [{ id: 'f1a', questions: [Q.F01, Q.F02] }],
  },
  {
    n: 2, id: 'work', title: 'What the work actually takes',
    steps: [
      { id: 'f2a', questions: [Q.F03] },
      { id: 'f2b', questions: [Q.F04] },
      { id: 'f2c', questions: [Q.F05] },
    ],
  },
  {
    n: 3, id: 'value', title: 'Value and AI',
    steps: [
      { id: 'f3a', questions: [Q.F06] },
      { id: 'f3b', questions: [Q.F07] },
      { id: 'f3c', questions: [Q.F08] },
    ],
  },
];

export const QUESTIONS = Q;

export const ALL_QUESTIONS = SECTIONS.flatMap((s) => s.steps.flatMap((st) => st.questions));

/* ---------- routing ----------
 *
 * This edition asks everyone everything, so there is nothing to route and
 * nobody to screen out. The exports stay so state.js and the function need no
 * variant of their own.
 */

export const SCREEN_OUT_OPTION = null;
export const ROUTING = {};

export function isEligible() { return true; }
export function isApplicable() { return true; }
export function dynamicRows() { return []; }
