// Browser test suite for index.html. Run it with: python3 tests/run.py
// The runner injects tests/fakes.js before the app and this file after it, loads the page in
// headless Chrome with all external network access blocked and reads <pre id="__results">:
// one "PASS section: name" or "FAIL section: name :: details" line per check.
// Checks run in order and share one page, so later sections build on the state left by earlier ones.
(async () => {
  const results = [];
  let section = '';
  const check = (name, passed, details) => {
    const label = `${section}: ${name}`;
    results.push(passed ? `PASS ${label}` : `FAIL ${label}${details !== undefined ? ` :: ${details}` : ''}`);
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Headless virtual time can delay BroadcastChannel delivery, so wait for an effect, not a fixed time.
  const waitFor = async (cond, ms = 20000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await sleep(50);
    return cond();
  };
  // An independent listener on the sync channel, to confirm when a test message was delivered.
  let probeSaw = null;
  const probe = new BroadcastChannel('vb_5_1_sync_v5');
  probe.onmessage = (ev) => { probeSaw = ev.data; };

  const ROTATIONS = ['S2', 'S1', 'S6', 'S5', 'S4', 'S3'];
  const $ = (id) => document.getElementById(id);
  const stored = () => JSON.parse(localStorage.getItem('vb_5_1_tactical_board_v5'));
  const button = (containerId, text) => [...$(containerId).querySelectorAll('button')].find((b) => b.textContent.includes(text));
  const rotation = (id) => button('rotation-buttons-grid', `(${id})`).click();
  const phase = (label) => button('phase-buttons-group', label).click();
  const token = (role) => document.querySelector(`.player-token[data-role="${role}"]`);
  // Court coordinates of a token (x 0-100, y 0-104), read back from its CSS position.
  const pos = (role) => ({
    x: parseFloat(token(role).style.left),
    y: Math.round(parseFloat(token(role).style.top) * 104) / 100
  });
  const at = (role, x, y) => pos(role).x === x && pos(role).y === y;
  const title = () => $('overlap-title').textContent;
  const explanation = () => $('overlap-subtitle').textContent;
  const rotationBadge = () => $('current-rot-badge').textContent;
  const note = () => $('tactical-note-body').textContent;
  const syncBadge = () => $('sync-badge-text').textContent;
  const setRules = (value) => {
    $('sel-rules').value = value;
    $('sel-rules').dispatchEvent(new Event('change'));
  };
  const exportJson = () => {
    $('btn-export-import').click();
    const json = JSON.parse($('json-textarea').value);
    $('btn-close-modal').click();
    return json;
  };
  const importJson = (text) => {
    $('btn-export-import').click();
    $('json-textarea').value = text;
    $('btn-import-json').click();
    $('btn-close-modal').click();
  };
  // The movement arrow that starts at a player's token (arrows start just outside the token).
  const arrowFrom = (role) => {
    const p = pos(role);
    return [...$('movement-arrows-layer').querySelectorAll('line')]
      .find((l) => Math.hypot(+l.getAttribute('x1') - p.x, +l.getAttribute('y1') - p.y) < 7);
  };

  function pointer(role, type, x, y) {
    const rect = $('court-stage').getBoundingClientRect();
    token(role).dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, button: 0, pointerType: 'mouse',
      clientX: rect.left + (x / 100) * rect.width,
      clientY: rect.top + (y / 104) * rect.height
    }));
  }
  function drag(role, x, y, release = true) {
    const p = pos(role);
    pointer(role, 'pointerdown', p.x, p.y);
    pointer(role, 'pointermove', x, y);
    if (release) pointer(role, 'pointerup', x, y);
  }
  function tap(role) {
    const p = pos(role);
    pointer(role, 'pointerdown', p.x, p.y);
    pointer(role, 'pointerup', p.x, p.y);
  }

  async function suiteMain() {
    section = 'defaults';
    check('libero off', !$('chk-libero').checked && !token('mb1').textContent.includes('L'));
    check('overlap guide lines off', !$('chk-overlaps').checked
      && $('overlap-lines-layer').children.length === 0 && $('legal-bounds-layer').children.length === 0);
    check('formation options off', !$('chk-short-d').checked && !$('chk-swap-s1').checked);
    check('lineup banner compact', $('overlap-subtitle').classList.contains('hidden')
      && $('overlap-chevron').textContent === '▸' && $('overlap-banner').getAttribute('aria-expanded') === 'false');

    section = 'lineup banner';
    $('overlap-banner').click();
    check('click shows the explanation', !$('overlap-subtitle').classList.contains('hidden')
      && $('overlap-chevron').textContent === '▾' && stored().bannerExpanded === true);
    $('overlap-banner').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('Enter hides it again', $('overlap-subtitle').classList.contains('hidden') && stored().bannerExpanded === false);
    check('view state is not shared with other tabs', !('bannerExpanded' in exportJson()));

    section = 'serve-receive';
    for (const r of ROTATIONS) {
      rotation(r);
      check(`${r} default formation is legal`, title().includes('Legal'), explanation());
    }

    section = 'shorter d routes';
    rotation('S2');
    check('off: S2 d waits deep left', at('d', 14, 78), JSON.stringify(pos('d')));
    check('off: S2 note gives the 8.0 m run', note().includes('8.0 m'));
    $('chk-short-d').click();
    check('on: S2 d waits at the net between mb2 and s', at('d', 40, 24), JSON.stringify(pos('d')));
    check('on: S2 formation stays legal', title().includes('Legal'), explanation());
    check('on: S2 note updated', note().includes('between mb2 and the setter'));
    rotation('S3');
    check('on: S3 d waits behind the setter, legal', at('d', 62, 28) && title().includes('Legal'),
      `${JSON.stringify(pos('d'))} ${explanation()}`);
    check('on: S3 note updated', note().includes('right behind the setter') && !note().includes('deep in Z6'));
    rotation('S1');
    check('on: other rotations unchanged', at('d', 14, 16), JSON.stringify(pos('d')));
    $('chk-short-d').click();
    rotation('S3');
    check('off again: S3 d back deep', at('d', 66, 78), JSON.stringify(pos('d')));

    section = 'swap attack sides in S1';
    rotation('S1');
    let a1Arrow = arrowFrom('a1');
    check('off: a1 runs to the left pin', a1Arrow && +a1Arrow.getAttribute('x2') < 30, a1Arrow && a1Arrow.outerHTML);
    check('off: d runs to the right', arrowFrom('d') && +arrowFrom('d').getAttribute('x2') > 70);
    $('chk-swap-s1').click();
    a1Arrow = arrowFrom('a1');
    check('on: a1 attacks from the right pin', a1Arrow && +a1Arrow.getAttribute('x2') > 70, a1Arrow && a1Arrow.outerHTML);
    check('on: d stays left (no arrow)', !arrowFrom('d'));
    check('on: note updated', note().includes('swapped'));
    rotation('S6');
    check('on: other rotations unchanged', arrowFrom('a2') && +arrowFrom('a2').getAttribute('x2') < 30);
    $('chk-swap-s1').click();
    rotation('S2');

    section = 'offline';
    await document.fonts.ready;
    check('embedded Inter font is loaded', document.fonts.check('700 16px Inter')
      && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded'));
    check('no CDN or font URLs in the page',
      !/https?:\/\/(fonts|cdn)\./.test(document.documentElement.innerHTML.replace(/<script>[\s\S]*?<\/script>/g, '')));

    section = 'serving';
    phase('3. Serving');
    rotation('S1');
    check('FIVB 2025 rules: serving team positions freely', title().includes('Free Positioning')
      && $('overlap-pill').textContent === 'FREE', title());
    const server = pos('s');
    check('S1: setter serves from the service zone', server.x === 80 && Math.abs(server.y - 95) < 0.2, JSON.stringify(server));
    const setterArrow = [...$('movement-arrows-layer').querySelectorAll('line')].find((l) => l.getAttribute('stroke') === '#fbbf24');
    check('S1: setter arrow leads to right back (defense)', setterArrow
      && +setterArrow.getAttribute('x2') > 75 && +setterArrow.getAttribute('y2') > 60, setterArrow && setterArrow.outerHTML);
    setRules('classic');
    for (const r of ROTATIONS) {
      rotation(r);
      check(`pre-2025 rules: ${r} stacked formation is legal`, title().includes('Legal'), explanation());
    }
    rotation('S1');
    drag('s', 30, 95);
    check('pre-2025 rules: server serving from the left is exempt', title().includes('Legal'), explanation());
    drag('d', pos('mb2').x + 15, 20);
    check('pre-2025 rules: front-row overlap is still a fault', title().includes('Fault')
      && explanation().includes('Z4 (D)'), explanation());
    $('btn-reset-view').click();
    check('Reset Phase restores the legal formation', title().includes('Legal'), explanation());
    setRules('fivb2025');

    section = 'court bounds';
    phase('2. Serve-Receive');
    rotation('S2');
    drag('a2', 52, 96);
    check('player behind the end line is a fault', explanation().includes('Z6 (A2) must be on the court'), explanation());
    $('btn-reset-view').click();

    section = 'defense and transition';
    phase('4. Defense Base');
    for (const r of ['S1', 'S6', 'S5']) {
      rotation(r);
      check(`${r}: back-row setter covers right back`, at('s', 82, 66), JSON.stringify(pos('s')));
    }
    check('banner names the phase', title().includes('Defense Base'), title());
    phase('5. Transition');
    rotation('S1');
    check('S1: setter at the net', at('s', 70, 14), JSON.stringify(pos('s')));

    section = 'selection';
    phase('2. Serve-Receive');
    rotation('S2');
    $('chk-libero').click();
    tap('mb1');
    const hint = $('selected-player-hint').textContent;
    check('hint names the libero on court', hint.includes('L (Libero)') && hint.includes('for MB1'), hint);
    check('roster highlight follows a token click',
      document.querySelector('[data-role-card="mb1"]').className.includes('border-amber-400')
      && !document.querySelector('[data-role-card="s"]').className.includes('border-amber-400'));
    check('a plain click stores no position', !stored().customCoords.S2_receive, JSON.stringify(stored().customCoords));

    section = 'tab sync and import';
    const bc = new BroadcastChannel('vb_5_1_sync_v5');
    bc.postMessage({ rotation: 'S4', names: { s: 5, d: 'Opp Anna' }, _sender: 'other' });
    await waitFor(() => rotationBadge().includes('S4'));
    check('remote update applied, malformed name ignored', rotationBadge().includes('S4')
      && stored().names.s === 'Setter' && stored().names.d === 'Opp Anna', JSON.stringify(stored().names));
    // Tab sync and JSON import share applyExternalState/sanitizeState; the import path is deterministic.
    importJson(JSON.stringify({ shortDRoutes: true, swapS1Attack: true }));
    check('incoming state carries the formation options', $('chk-short-d').checked && $('chk-swap-s1').checked, JSON.stringify(stored()));
    const shared = exportJson();
    check('outgoing state carries the formation options', shared.shortDRoutes === true && shared.swapS1Attack === true);
    $('chk-short-d').click();
    $('chk-swap-s1').click();
    check('options switched off again', !stored().shortDRoutes && !stored().swapS1Attack);
    drag('a1', 40, 60);
    const positionsBefore = JSON.stringify(stored().customCoords.S4_receive);
    check('export omits the Firebase URL and selection', !/firebaseUrl|selectedRole/.test(JSON.stringify(exportJson())));
    importJson('{"rotation":"S3"}');
    const afterImport = stored();
    check('partial import keeps positions and settings', afterImport.rotation === 'S3' && afterImport.useLibero === true
      && afterImport.showArrows && afterImport.showOverlaps === false
      && JSON.stringify(afterImport.customCoords.S4_receive) === positionsBefore, JSON.stringify(afterImport));
    importJson('[1,2]');
    check('non-object import is rejected', stored().rotation === 'S3' && $('toast').textContent.includes('Invalid'));

    section = 'drag during sync';
    rotation('S2');
    drag('a2', 60, 70, false);
    bc.postMessage({ rotation: 'S6', _sender: 'other', _id: 'held' });
    check('(harness) message arrived mid-drag', await waitFor(() => probeSaw && probeSaw._id === 'held'));
    await sleep(100);
    check('update is held while dragging', rotationBadge().includes('S2'));
    pointer('a2', 'pointerup', 60, 70);
    check('held update applied on drop', rotationBadge().includes('S6'));
    check('dragged position survives the merge',
      JSON.stringify(stored().customCoords.S2_receive.a2) === '{"x":60,"y":70}', JSON.stringify(stored().customCoords));

    section = 'typing during sync';
    const nameInput = document.querySelector('[data-role-input="a1"]');
    nameInput.focus();
    nameInput.value = 'Mia';
    nameInput.dispatchEvent(new Event('input'));
    bc.postMessage({ rotation: 'S5', names: { a1: 'stale' }, _sender: 'other' });
    await waitFor(() => rotationBadge().includes('S5'));
    const active = document.activeElement;
    check('focus and typed text survive a remote update', active && active.dataset.roleInput === 'a1'
      && active.value === 'Mia' && rotationBadge().includes('S5'), active && active.outerHTML.slice(0, 60));
    active.blur();

    section = 'Firebase sync (simulated)';
    const puts = window.__firebasePuts;
    const streams = window.FakeEventSource.instances;
    $('input-firebase-url').value = 'ftp://nope';
    $('btn-connect-rtdb').click();
    check('invalid URL rejected', streams.length === 0);
    $('input-firebase-url').value = 'https://demo.firebaseio.com/board.json';
    $('btn-connect-rtdb').click();
    check('connecting: honest badge, no write before the first snapshot',
      syncBadge().includes('Connecting') && puts.length === 0, `${syncBadge()} puts=${puts.length}`);
    const first = streams[0];
    first.emit('put', { path: '/', data: null });
    await sleep(50);
    check('empty database receives this board', puts.length === 1 && syncBadge().includes('Synced'), `puts=${puts.length}`);
    check('written board has no URL', !('firebaseUrl' in puts[0].body));
    const setterInput = document.querySelector('[data-role-input="s"]');
    for (const value of ['A', 'An', 'Ann', 'Anna']) {
      setterInput.value = value;
      setterInput.dispatchEvent(new Event('input'));
    }
    await sleep(500);
    check('keystrokes coalesced into one write', puts.length === 2 && puts[1].body.names.s === 'Anna', `puts=${puts.length}`);
    setterInput.blur();
    first.emit('put', { path: '/', data: { rotation: 'S1', _sender: 'remote' } });
    check('remote change applied', rotationBadge().includes('S1'));

    const writesBefore = puts.length;
    $('btn-connect-rtdb').click();
    const second = streams[1];
    check('reconnect closes the old stream', first.closed);
    second.emit('put', { path: '/', data: { rotation: 'S4', names: { s: 'Remote S' }, _sender: 'remote' } });
    await sleep(500);
    check('existing shared board wins and is not overwritten', rotationBadge().includes('S4')
      && stored().names.s === 'Remote S' && puts.length === writesBefore, `extra puts=${puts.length - writesBefore}`);
    second.emit('cancel', null);
    check('stream cancel shows the error badge', syncBadge().includes('Error'));
    second.emit('put', { path: '/', data: { rotation: 'S4', _sender: 'remote' } });
    check('badge recovers on the next snapshot', syncBadge().includes('Synced'));

    $('btn-reset-all').click();
    await sleep(500);
    const lastWrite = puts[puts.length - 1].body;
    check('Reset All keeps the connection and shares the reset', !second.closed && stored().firebaseUrl.includes('demo')
      && lastWrite.rotation === 'S2' && lastWrite.names.s === 'Setter' && syncBadge().includes('Synced'));
    $('input-firebase-url').value = '';
    $('btn-connect-rtdb').click();
    check('clearing the URL disconnects', second.closed && syncBadge().includes('Tab Sync'));
  }

  function suiteCorruptStorage() {
    section = 'corrupt storage';
    check('app still renders', !!token('s').style.left);
    check('old "base" phase migrates to Transition', title().includes('Transition'), title());
    check('old "base" positions migrate', at('s', 10, 10), JSON.stringify(pos('s')));
    check('malformed names are ignored', document.querySelector('[data-role-input="s"]').value === 'Setter'
      && document.querySelector('[data-role-input="d"]').value === 'Diagonal');
    check('malformed boolean falls back to the default (off)', $('chk-libero').checked === false);
  }

  try {
    if (location.hash === '#corrupt-storage') suiteCorruptStorage();
    else await suiteMain();
  } catch (e) {
    results.push(`FAIL ${section}: exception :: ${String(e.stack || e).replace(/\n/g, ' | ')}`);
  }
  window.__pageErrors.forEach((e) => results.push(`FAIL page error :: ${e}`));
  const pre = document.createElement('pre');
  pre.id = '__results';
  pre.textContent = `\n${results.join('\n')}\n`;
  document.body.appendChild(pre);
})();
