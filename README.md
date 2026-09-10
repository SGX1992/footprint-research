# Footprint Intelligence Research — The Age of Business Resilience & Sustainable Transformation

A research landing page and eight-question survey for
**research.footprint-intelligence.com**. Answers are written to Notion.

Same engine as `../ddx-research`, in the Footprint palette: Poppins,
`#00EB62`, the glow render. The questionnaire comes from the Notion form at
`road-vinca-cd0.notion.site`.

Static site, **no build step**:

```bash
node serve.mjs
```

…then open <http://localhost:8795>.

| | |
| --- | --- |
| `NOTION_TOKEN=ntn_… node serve.mjs` | writes to the real Notion databases |
| `node serve.mjs` | no token — the page shows its preview state |
| `STUB=1 node serve.mjs` | answers "saved" without contacting Notion, for the confirmation screens |

## What is different from the DDX build

- **Eight questions, F01–F08**, three sections, no matrices and no routing —
  everyone sees everything. `ROUTING` is an empty object rather than a special
  case, so a branch can be added later without restructuring anything.
- **No speaker reel.** `main.js` passes `null`; the renderer only draws the
  panel when it is handed one.
- **Two minutes is accurate here.** Eight questions across seven screens.
- Two changes to the source form: *"Unclear responsibilites"* → **
  responsibilities** in F04, and **F08 was rewritten**. It asked which
  challenge is underestimated; it now asks for a view on the future of
  corporate sustainability and the key challenges to overcome — the two
  overlapped, and a view is the more quotable answer.

Everything else — the cascade, the section rail, the collapsed summaries,
duplicate protection, the honest failure state — is the same code.

## How a section screen works

Every question in the section is on the page at once. Exactly one is open:
**ahead** (readable, no options yet), **active** (the only controls), **done**
(one line, your answer, a way back in).

A single choice closes itself and opens the next. Anything where only the
respondent knows they have finished — select up to three, free text — waits for
the **Next** control inside the question.

## Where things live

| File | What it is |
| --- | --- |
| `assets/js/questionnaire.js` | **every question and option.** The only file to edit to change the survey |
| `assets/js/config.js` | study title and theme, brand strings, privacy URL, duration, benefits, endpoint |
| `assets/js/state.js` | answers, progress, the submission payload |
| `assets/js/ui.js` | rendering |
| `assets/js/main.js` | screens, handlers, end states |
| `netlify/functions/submit.mjs` | **the only thing that talks to Notion.** Holds the token |
| `tools/check-mapping.mjs` | checks the payload → Notion mapping against the real schema |

`assets/js/countries.js` is unused in this edition and left in place — F01–F08
ask for no location, but the next one might.

### Changing a question

Edit `questionnaire.js`, then **bump `STUDY.version` in `config.js`**, then
re-run the mapping check. The version is stored with every response.

## Notion

Two databases under **Experience, Marketing, Sales → Research**:

| Database | Holds |
| --- | --- |
| [Research Survey](https://app.notion.com/p/45270517759d451e849038830bef92fc) | one row per submitted questionnaire |
| [Research Contact Preferences](https://app.notion.com/p/f4351c9db98a4d18a1d9aa5ab4b8482b) | optional email preferences, kept separate |

`Raw JSON` is the canonical record; build exports from it. The two stores share
no respondent identifier by design.

The source Notion form asked for the email inline, before Submit. Here it is a
separate, optional step **after** the response is stored, so declining it
cannot cost a submission and the research answers carry no address.

### Setup

1. Create an internal integration at
   <https://www.notion.so/profile/integrations>.
2. Share **both** databases with it, or every write returns 404.
3. Set `NOTION_TOKEN` on the deployment.

## Hosting

The function needs a server; GitHub Pages cannot run it. Either deploy the
whole folder to Netlify and point the domain there, or use `deploy-pages.sh`
for the page and Netlify for the function, then set `SUBMIT_ENDPOINT` in
`config.js` to the absolute function URL. The function already sends CORS
headers.

## Before launch

- [ ] **Publish the privacy notice and set `PRIVACY_URL`.**
- [ ] Set `NOTION_TOKEN` and share both databases with the integration.
- [ ] Confirm the three "What you get" claims in `config.js` are ones
      Footprint Intelligence will keep.
- [ ] Decide hosting.

Nothing in the page claims a participant count, a partner, an endorsement, a
finding or a publication date, and there is no scoring.
