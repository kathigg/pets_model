export default function Home() {
  return (
    <>
      <a className="skip" href="#messages">Skip to conversation</a>
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="PETs Model home">
            <span id="mascot" className="brand-mascot" data-action="waiting" aria-hidden="true" />
            <span>PETs Model</span>
          </a>
          <div className="top-actions">
            <span id="source-count" className="source-status" role="status" aria-live="polite">Loading sources…</span>
            <button id="export" className="quiet-button" type="button" title="Download this conversation">Download</button>
            <button id="reset" className="new-button" type="button">New chat</button>
          </div>
        </header>

        <main className="main" id="chat">
          <section className="conversation" aria-label="PETs Model chat">
            <div className="welcome">
              <h1>How can I help?</h1>
              <p>Ask about a PET or describe your use case.</p>
              <div className="starter-pills" role="group" aria-label="Try a question">
                <button type="button" data-prompt="What is differential privacy?">Explain a PET</button>
                <button type="button" data-prompt="I want to explore a use case">Explore a use case</button>
                <button type="button" data-prompt="How do I plan a PET pilot?">Plan a pilot</button>
              </div>
            </div>

            <div id="messages" className="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" tabIndex={0} />

            <form id="composer" className="composer">
              <label className="sr-only" htmlFor="prompt">Your message</label>
              <textarea id="prompt" rows={2} maxLength={1200} placeholder="Ask a question or describe what you need to do…" />
              <div className="composer-foot">
                <span>Use hypothetical details. If AI is active, messages go to its provider.</span>
                <button type="submit">Send<span className="sr-only"> message</span><span aria-hidden="true"> ↑</span></button>
              </div>
            </form>
          </section>
        </main>
      </div>
      <script type="module" src="/app.mjs" />
    </>
  );
}
