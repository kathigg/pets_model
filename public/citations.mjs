/** Keep our draft note headings distinct from the original page's title. */
function sourceOwner(source) {
  let host = '';
  try { host = new URL(source.url).hostname; } catch { return source.publisher || 'Public'; }
  if (host === 'mdi.georgetown.edu' || host === 'georgetown.app.box.com') return 'MDI';
  if (host.endsWith('nist.gov')) return 'NIST';
  if (host === 'ico.org.uk') return 'ICO';
  if (host === 'studentprivacy.ed.gov') return 'U.S. Education Department';
  if (host === 'www.gov.uk') return 'UK Government';
  if (host === 'cran.r-project.org') return 'CRAN';
  if (host === 'pmc.ncbi.nlm.nih.gov') return 'Research paper';
  return source.publisher || host;
}

export function sourceCitationLabel(source) {
  if (source.source_role === 'web_grounding') return source.title;
  const owner = sourceOwner(source);
  if (source.page) return `${owner} report, p. ${source.page}`;
  if (owner === 'CRAN') return 'CRAN documentation';
  if (owner === 'Research paper') return owner;
  return `${owner} source`;
}

export function originalSourceLabel(sources) {
  const first = sources[0];
  if (!first) return 'Original source';
  if (first.source_role === 'web_grounding') return first.title;
  if (sources.every(source => source.source_document && source.source_document === first.source_document)) {
    return first.source_document;
  }
  if (first.url === 'https://mdi.georgetown.edu/pets/use-cases/') return 'MDI PETs use cases';
  return `${sourceOwner(first)} original source`;
}
