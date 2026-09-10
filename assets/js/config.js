/* Everything about this deployment that is not the questionnaire itself. */

export const STUDY = {
  id: 'abrst-2027',
  /* Bump on any change to wording, options or routing. Stored with every
     response so answers can never be misread against a later revision. */
  version: 'abrst-2027.v2',
  eyebrow: 'FOOTPRINT INTELLIGENCE RESEARCH',
  title: 'The Age of Business Resilience & Sustainable Transformation',
  /* The framing line under the headline. The source form's full sentence is
     three lines at display width and pushes the button off a laptop screen —
     it runs in full on the page below instead. */
  theme: 'Insights from sustainability leaders across Europe.',
};

/* REQUIRED BEFORE PUBLIC LAUNCH. The approved privacy notice. While this is
   empty the link renders as an explicit "not yet published" state rather than
   a dead link. */
export const PRIVACY_URL = '';

/* The serverless function that holds the Notion token. A GET here is a health
   probe: if it does not answer, the page says so instead of pretending to
   save. Never put a Notion token in this file. */
export const SUBMIT_ENDPOINT = '/.netlify/functions/submit';

/* Eight questions, seven screens, no matrices — two minutes is a claim this
   questionnaire can actually keep. */
export const DURATION_ESTIMATE = '2 minutes';

/* Why someone should spend those minutes. Every line has to be something
   Footprint Intelligence will actually do. */
export const BENEFITS = [
  {
    title: 'Get the findings first',
    body: 'Contributors receive the full report before it is published.',
  },
  {
    title: 'See how your peers answered',
    body: 'Results reported in aggregate across functions and industries.',
  },
  {
    title: 'Set the agenda',
    body: 'What comes back shapes what this research asks next.',
  },
];

export const BRAND = {
  short: 'Footprint Intelligence',
  research: 'Footprint Intelligence Research',
};

export const THANKS = {
  title: 'Thank you for contributing to the Footprint Intelligence research.',
  body: 'Your perspective will help inform how sustainability teams across Europe are supported, and what this research asks next.',
};

export const CONTACT_URL = 'https://www.footprint-intelligence.com/';
