// Loaded before the app script by tests/run.py. Replaces the browser APIs the app uses for
// Firebase sync with recording fakes, collects page errors and resets storage for each run.
window.__pageErrors = [];
window.addEventListener('error', (e) => window.__pageErrors.push(`${e.message} @${e.lineno}`));

// Firebase REST writes (PUT) are recorded instead of sent.
window.__firebasePuts = [];
window.fetch = (url, opts) => {
  window.__firebasePuts.push({ url, body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true });
};

// Firebase streaming reads: tests play server events with emit(type, data).
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  emit(type, data) {
    (this.listeners[type] || []).forEach((fn) => fn({ data: JSON.stringify(data) }));
  }
  close() {
    this.closed = true;
  }
}
FakeEventSource.instances = [];
window.FakeEventSource = FakeEventSource;
window.EventSource = FakeEventSource;

localStorage.clear();

// Scenario "corrupt-storage": a saved board from an older version with malformed values.
if (location.hash === '#corrupt-storage') {
  localStorage.setItem('vb_5_1_tactical_board_v5', JSON.stringify({
    names: { s: 5, d: { x: 1 } },
    phase: 'base',
    useLibero: 'yes',
    customCoords: {
      S2_base: { s: { x: 10, y: 10 }, d: { x: 'a', y: 3 } },
      junk_key: {},
      S9_receive: { s: { x: 1, y: 1 } }
    }
  }));
}
