# PETs Model

A public-source chatbot for exploring privacy-enhancing technologies (PETs) in education data projects. It explains PETs, works through a use case, compares a layered architecture, and helps plan a reviewed pilot.

Hosted demo: [PETs Model](https://pets-model.fluffy-buddy-4572.chatgpt.site). Its access setting is managed separately from this source repository.

## What works now

- One chat for **understanding PETs**, **exploring a use case**, and **planning a pilot**, with short answers and more detail on demand.
- In-chat questions and editable case details for data holders, movement, exact versus approximate linkage, controlled row access, released outputs, repeated analyses, sensitivity, technical capacity, and review of authority.
- Multi-PET suggestions with rationale, caveats, alternatives, counterindications, a rule trace, and the next clarifying question.
- A local retrieval index of 47 reviewed, original paraphrased passages from public MDI reports and pages, NIST, ICO, U.S. Department of Education, GOV.UK, and peer-reviewed research. Informational answers link to the retrieved passages; architecture cards link to sources selected for each rule.
- A clear escalation path for unreviewed authority, direct-identifier release, protected row-level release, and legal questions. Unknown case details stay unknown.
- A downloadable case summary for human review. Case text stays in the browser and is not submitted to an application server.

The recommender is **decision support**. It does not certify legal compliance, identify an optimal PET, or replace privacy and technical experts. This is retrieval-augmented, extractive chat: information answers display retrieved source summaries, while use-case answers combine inspectable rules with claim-specific citations. There is no hosted LLM or fine-tuned model in this public version; see [the architecture](docs/ARCHITECTURE.md) for the private expert-annotation and model path.

## Run locally

This is a buildless static app. With Node 20+ for checks:

```bash
npm run check
python3 -m http.server 5173 --directory dist
```

Open `http://localhost:5173/`. The app itself needs no package installation and no API key.

## Repository map

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/styles.css`, `dist/app.mjs` | Responsive chatbot interface and local session state |
| `dist/engine.mjs` | Transparent case extraction and layered recommendation rules |
| `dist/retrieval.mjs` | BM25 retrieval with PET vocabulary normalization |
| `dist/data/sources.json` | Reviewed public-source passages, jurisdiction, role, and provenance |
| `data/eval_queries.json`, `scripts/` | Corpus validation and retrieval evaluation |
| `tests/` | Safety-critical decision and retrieval checks |

## Privacy and content policy

The chatbot indexes **public PET resources only**. The attached internal project materials, partner notes, contact sheets, unpublished reports, and example datasets are absent from this repository and its deployed site. Public pilot reports linked from MDI are represented by short, original summaries with page provenance; report files are not copied into the app. The app uses no analytics or chat storage. A visitor should use hypothetical details; the case export remains on their own device until they choose to share it.

See [CONTENT_POLICY.md](docs/CONTENT_POLICY.md) before adding sources. The source review date is a snapshot, not a promise that external guidance stays current. Legal and regulatory questions need current primary-source review by a qualified person.

## Development and evaluation

```bash
npm run validate:corpus
npm test
npm run eval
```

The included retrieval set has ten synthetic questions plus report-specific and safety tests. Passing these checks confirms the coded cases and retrieval expectations only; it does not validate PET selection against expert ground truth. Expert-labeled cases, privacy and utility measurements, broader source coverage, and review of every recommendation are needed before agency-facing deployment.

## License

Original code and original paraphrased summaries in this repository are MIT licensed. External pages remain with their publishers and are linked for attribution. No code or prose was copied from the unlicensed private project archive provided as background.
