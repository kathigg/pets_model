# Public source policy

Only verified public PET resources may enter `dist/data/sources.json`. Each chunk must be an original, short paraphrase tied to a specific URL and publisher, with a source review date, jurisdiction, and source role. Do not copy paragraphs or tables wholesale. Source titles and URLs are not evidence of publication rights for attached files.

## Review gate

For each addition:

1. Open the exact public page and confirm that the text supports the proposed summary.
2. Record publisher, publication year if visible, URL, PET and user-need tags, jurisdiction, source role, and the date of review. For a public report, record the document title, section, page, and the publisher's public landing page.
3. Check whether the page is a draft, under review, superseded, or jurisdiction-specific. Preserve those caveats in the chunk.
4. Check PET terminology, including DP epsilon direction, TEE versus TRE, and the limits of hashing and synthetic data.
5. Run `npm run check` and inspect a few live answers that should retrieve the new chunk.

The index permits reviewed MDI, NIST, ICO, U.S. Department of Education, GOV.UK, and PubMed Central hosts, plus three exact public MDI report links on Box. The report links are allowlisted individually and must have an MDI landing page. Change the allowlist in `scripts/validate-corpus.mjs` only after reviewing a new publisher.

## Exclusions

Do not add internal meeting notes, partner contact sheets, grant budgets, unfinished PET sheets, draft slide decks, unverified public-link inventories, private repositories, raw datasets, or documents whose release rights are unclear. The public corpus excludes all supplied attachments as files, even when an attachment matches a public report. Use the public publisher's page or its public report link instead.

If a source conflicts with another source or has a known error, quarantine it until reviewed. Do not use retrieval rank as a truth or confidence score. Mark insufficient evidence plainly and route complex choices to expert review.
