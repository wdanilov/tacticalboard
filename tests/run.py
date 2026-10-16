#!/usr/bin/env python3
"""Run the tactical board's browser tests in headless Chrome.

    python3 tests/run.py              # summary, failures in detail
    python3 tests/run.py --verbose    # list every check
    python3 tests/run.py --repeat 5   # run the suite 5 times to spot flaky checks

Builds a test copy of index.html with tests/fakes.js injected before the app and
tests/board.test.js after it, serves it on localhost and loads it in headless Chrome with
all other network access blocked. Exits with status 1 if any check fails.
"""
import argparse
import functools
import html
import http.server
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

TESTS = Path(__file__).resolve().parent
ROOT = TESTS.parent
SCENARIOS = {'main': '', 'corrupt-storage': '#corrupt-storage'}
CHROME_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']
MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
RESULTS = re.compile(r'<pre id="__results">(.*?)</pre>', re.S)


def find_chrome():
    if os.environ.get('CHROME'):
        return os.environ['CHROME']
    for name in CHROME_NAMES:
        path = shutil.which(name)
        if path:
            return path
    if Path(MAC_CHROME).exists():
        return MAC_CHROME
    sys.exit('Chrome not found. Install Google Chrome or Chromium, or set CHROME=/path/to/chrome.')


def build_test_page(site):
    page = (ROOT / 'index.html').read_text(encoding='utf-8')
    fakes = (TESTS / 'fakes.js').read_text(encoding='utf-8')
    suite = (TESTS / 'board.test.js').read_text(encoding='utf-8')
    if page.count('<head>') != 1 or page.count('</body>') != 1:
        sys.exit('index.html must contain exactly one <head> and one </body>.')
    page = page.replace('<head>', f'<head><script>{fakes}</script>', 1)
    page = page.replace('</body>', f'<script>{suite}</script></body>', 1)
    (site / 'test.html').write_text(page, encoding='utf-8')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(site):
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def run_scenario(chrome, url, profile):
    """Returns the PASS/FAIL lines of one page load, or None if the page produced no results."""
    command = [
        chrome, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        f'--user-data-dir={profile}', '--window-size=1400,1800',
        # Simulated time lets the suite's waits finish quickly; the page is dumped when it runs out.
        '--virtual-time-budget=120000',
        # Everything except the local test server fails, proving the page works offline.
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--dump-dom', url,
    ]
    if os.environ.get('CI'):
        # CI containers often lack the user namespaces Chrome's sandbox needs; the page is our own.
        command.insert(1, '--no-sandbox')
    try:
        output = subprocess.run(command, capture_output=True, text=True, timeout=300).stdout
    except subprocess.TimeoutExpired:
        return None
    match = RESULTS.search(output)
    if not match:
        return None
    return [line for line in html.unescape(match.group(1)).splitlines() if line.startswith(('PASS', 'FAIL'))]


def main():
    parser = argparse.ArgumentParser(description='Run the browser tests for index.html in headless Chrome.')
    parser.add_argument('-v', '--verbose', action='store_true', help='list every check, not just failures')
    parser.add_argument('--repeat', type=int, default=1, metavar='N', help='run the suite N times')
    args = parser.parse_args()

    chrome = find_chrome()
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        site = tmp / 'site'
        site.mkdir()
        build_test_page(site)
        server = serve(site)
        try:
            for run in range(1, args.repeat + 1):
                for name, fragment in SCENARIOS.items():
                    label = name if args.repeat == 1 else f'{name} (run {run})'
                    url = f'http://127.0.0.1:{server.server_port}/test.html{fragment}'
                    lines = run_scenario(chrome, url, tmp / f'profile-{run}-{name}')
                    if lines is None:
                        print(f'{label}: FAILED, the page produced no results (crash or timeout)')
                        failures += 1
                        continue
                    passed = [line for line in lines if line.startswith('PASS')]
                    failed = [line for line in lines if line.startswith('FAIL')]
                    print(f'{label}: {len(passed)} passed, {len(failed)} failed')
                    for line in (lines if args.verbose else failed):
                        print(f'  {line}')
                    failures += len(failed) + (0 if passed else 1)
        finally:
            server.shutdown()

    print('All checks passed.' if failures == 0 else f'{failures} failure(s).')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
