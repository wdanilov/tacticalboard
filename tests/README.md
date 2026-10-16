# Browser tests

Automated checks for `index.html`, run in headless Chrome without a network connection.

```sh
python3 tests/run.py              # summary; failures are listed in detail
python3 tests/run.py --verbose    # list every check
python3 tests/run.py --repeat 5   # run the suite 5 times to spot flaky checks
```

The script exits with status 1 if any check fails. A run takes a few seconds.

## Requirements

- Python 3.7 or newer, standard library only.
- Google Chrome or Chromium. The runner looks for `google-chrome`, `chromium` and similar on
  your `PATH`, and for the default install location on macOS. To use another browser binary,
  set `CHROME=/path/to/chrome`.

## What is tested

| Section | Checks |
| --- | --- |
| defaults, lineup banner | Libero and overlap guide lines off; banner compact, expands on click or Enter, not synced |
| serve-receive | All six default formations are legal |
| shorter d routes, swap attack sides in S1 | Positions, legality, arrows and tactical notes with the option on and off |
| offline | Embedded Inter font loads; no CDN or font URLs left in the page |
| serving | FIVB 2025 free positioning; pre-2025 stacking legal in every rotation; server exempt; overlap still caught |
| court bounds, defense and transition | Off-court fault; back-row setter covers right back; setter at the net in transition |
| selection | Libero hint, roster highlight, a plain click stores nothing |
| tab sync and import | Malformed remote data ignored; options sync; partial import keeps the rest; bad JSON rejected |
| drag / typing during sync | Updates are held during a drag and merged; focus and typed text survive remote updates |
| Firebase sync (simulated) | No write before the first snapshot; empty database gets this board, existing board wins; writes coalesced; status badge; Reset All; disconnect |
| corrupt storage (second scenario) | An old saved board with malformed values still loads, migrates and falls back to defaults |

## How it works

1. `run.py` copies `index.html` to a temporary folder. It inserts `fakes.js` before the
   app's script and `board.test.js` after it.
2. `fakes.js` replaces `fetch` and `EventSource` (the Firebase connection) with recording
   fakes, collects page errors and clears `localStorage`. For the `#corrupt-storage`
   scenario it seeds a malformed saved board instead.
3. The page is served on `127.0.0.1` and loaded with `--dump-dom`. Every other host fails to
   resolve, so any leftover external request would show up as a failure.
4. Chrome runs on simulated time, which lets waits finish instantly. The suite writes one
   `PASS …` or `FAIL … :: details` line per check into `<pre id="__results">`, and `run.py`
   reads them back.

## Writing checks

- Add a `check('what should hold', condition, detailsShownOnFailure)` call inside a
  `section = '…'` block in `board.test.js`.
- **Checks share one page and run in order.** A section starts from the state the
  previous one left, such as the current rotation, phase and options. Set what you
  depend on explicitly, and switch options back off afterwards.
- **For anything that arrives through tab sync, wait for the effect:**
  `await waitFor(() => condition)`. Simulated time can delay `BroadcastChannel`
  messages past any fixed `sleep`.
- **Some checks compare exact court coordinates,** for example d at (40, 24) in S2. If
  you move a default position on purpose, update the matching check. The "formation is
  legal" checks need no change.
- Court coordinates run from x 0–100 (left to right, seen from your own baseline) and
  y 0–104 (net at 8, attack line at 36, end line at 92).

## Continuous integration

`.github/workflows/tests.yml` runs on every push to `master`, on pull requests, and
manually from the Actions tab. It has two jobs:

- **Browser tests:** `python3 tests/run.py`.
- **Tailwind CSS up to date:** runs `build-css.py` and fails if `index.html` changes, which
  means someone used a new class without regenerating the CSS (see `script.readme.md`).

Results appear as a green or red check next to each commit on GitHub. GitHub Pages still
deploys `master` regardless of the result.

## Not covered

A real Firebase database, two real browser tabs, touch input and visual layout. Check
those by hand when you change them.
