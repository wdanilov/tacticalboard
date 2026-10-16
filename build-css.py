#!/usr/bin/env python3
"""Regenerate the inlined Tailwind CSS in index.html.

Run after adding Tailwind utility classes that the page did not use before:

    python3 build-css.py

Downloads the pinned Tailwind standalone CLI once (checked against the SHA-256
hashes below) into ~/.cache/tailwindcss-cli, compiles the classes used in
index.html and replaces the contents of <style id="tailwind-css">.
"""
import hashlib
import os
import platform
import re
import stat
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

VERSION = 'v3.4.17'
SHA256 = {
    'tailwindcss-linux-arm64': '69b1378b8133192d7d2feb12a116fa12d035594f58db3eff215879e4ad8cf39b',
    'tailwindcss-linux-armv7': '704e7d91afba6e1f630889afd0d7db36b4634e628512cc141d504a5beae28860',
    'tailwindcss-linux-x64': '7d24f7fa191d2193b78cd5f5a42a6093e14409521908529f42d80b11fde1f1d4',
    'tailwindcss-macos-arm64': 'a1d0c7985759accca0bf12e51ac1dcbf0f6cf2fffb62e6e0f62d091c477a10a3',
    'tailwindcss-macos-x64': '6cbdad74be776c087ffa5e9a057512c54898f9fe8828d3362212dfe32fc933a3',
    'tailwindcss-windows-arm64.exe': '76f516476784c00f1562160b5758e3d8f0e6c48957efb26b5b50fbdfd76aa382',
    'tailwindcss-windows-x64.exe': '67f1c5e3f5a03406a7bf5badf5ada09b79f3ae78ec43450c15f7e983068da346',
}
PAGE = Path(__file__).resolve().parent / 'index.html'
STYLE_BLOCK = re.compile(r'(<style id="tailwind-css">)(.*?)(</style>)', re.S)


def asset_name():
    os_name = {'linux': 'linux', 'darwin': 'macos', 'windows': 'windows'}.get(platform.system().lower())
    arch = {'x86_64': 'x64', 'amd64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64', 'armv7l': 'armv7'}.get(platform.machine().lower())
    name = f'tailwindcss-{os_name}-{arch}' + ('.exe' if os_name == 'windows' else '')
    if name not in SHA256:
        sys.exit(f'No Tailwind standalone CLI for {platform.system()} {platform.machine()}.')
    return name


def tailwind_cli():
    name = asset_name()
    path = Path.home() / '.cache' / 'tailwindcss-cli' / VERSION / name
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == SHA256[name]:
        return path

    url = f'https://github.com/tailwindlabs/tailwindcss/releases/download/{VERSION}/{name}'
    print(f'Downloading {url}', flush=True)
    with urllib.request.urlopen(url) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != SHA256[name]:
        sys.exit('Checksum mismatch for the downloaded Tailwind CLI; refusing to run it.')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def main():
    html = PAGE.read_text(encoding='utf-8')
    if len(STYLE_BLOCK.findall(html)) != 1:
        sys.exit('index.html must contain exactly one <style id="tailwind-css"> block.')

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # Scan the page without its current CSS, so selectors of removed classes don't survive.
        (tmp / 'page.html').write_text(STYLE_BLOCK.sub(r'\1\3', html), encoding='utf-8')
        (tmp / 'input.css').write_text('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n', encoding='utf-8')
        subprocess.run(
            [str(tailwind_cli()), '-i', str(tmp / 'input.css'), '-o', str(tmp / 'out.css'),
             '--content', str(tmp / 'page.html'), '--minify'],
            check=True,
            # The CLI bundles its own browser data; its "caniuse-lite is outdated" notice is not actionable here.
            env={**os.environ, 'BROWSERSLIST_IGNORE_OLD_DATA': '1'},
        )
        css = (tmp / 'out.css').read_text(encoding='utf-8').strip()

    updated = STYLE_BLOCK.sub(lambda m: m.group(1) + css + m.group(3), html)
    if updated == html:
        print('index.html is already up to date.')
    else:
        PAGE.write_text(updated, encoding='utf-8')
        print(f'Updated the Tailwind CSS in index.html ({len(css)} bytes).')


if __name__ == '__main__':
    main()
