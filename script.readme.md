# build-css.py: regenerating the page's CSS

`index.html` is a single, self-contained file. Its styling comes from
[Tailwind CSS](https://tailwindcss.com) utility classes (`bg-slate-900`, `px-3`, …).
Instead of loading Tailwind from a CDN at runtime, the page carries the compiled CSS
for exactly the classes it uses, inside one block:

```html
<style id="tailwind-css">…generated CSS…</style>
```

The Inter font is embedded in the page too (licence: `licenses/Inter-OFL.txt`), so the
page makes no external requests and works offline. Only the optional Firebase sync
contacts a server.

`build-css.py` regenerates that block. Run it whenever the set of classes in the
page changes.

## When to run it

| Change you made | Run the script? |
| --- | --- |
| Used a Tailwind class that the page did not use before (in HTML or in a JS string) | **Yes**, otherwise the class has no effect |
| Removed classes | Optional; it drops their now-unused CSS |
| Changed JavaScript logic, text or data, or reused existing classes | No |
| Edited the hand-written `<style>` block at the top of `<head>` | No |

If you're unsure, run it anyway. When nothing changed, it reports that the page is
already up to date and leaves the file untouched.

## Usage

From the repository folder:

```sh
python3 build-css.py      # Linux / macOS (or ./build-css.py)
py build-css.py           # Windows
```

Then open `index.html` in a browser to check the result, and commit `index.html`.

Possible output:

- `Downloading https://github.com/...`: the first run fetches the Tailwind CLI (about 43 MB).
- `Rebuilding... Done in …ms.`: printed by the Tailwind CLI itself.
- `Updated the Tailwind CSS in index.html (N bytes).`: the block was replaced.
- `index.html is already up to date.`: nothing to do; the file was not touched.

## Requirements

- Python 3.6 or newer, standard library only (nothing to install).
- Internet access on the first run only.
- A platform with a Tailwind standalone CLI: Linux (x64, arm64, armv7), macOS
  (x64, Apple Silicon) or Windows (x64, arm64). Node.js is **not** needed.

## What the script does

1. Finds the Tailwind standalone CLI in `~/.cache/tailwindcss-cli/v3.4.17/`. If it is
   missing, it downloads the CLI from the official Tailwind GitHub release.
2. Checks the CLI's SHA-256 against the hashes pinned in the script, both after
   downloading and on every later run. On a mismatch it stops and runs nothing.
3. Copies `index.html` without the current generated CSS to a temporary folder. The
   old CSS is excluded so that its selectors can't keep removed classes alive.
4. Runs the CLI on that copy (`@tailwind base`, `components`, `utilities`, minified).
5. Replaces the contents of `<style id="tailwind-css">` in `index.html` and writes the
   file only if something changed.

To free the disk space or force a fresh download, delete `~/.cache/tailwindcss-cli`.

## Rules for writing classes

Tailwind finds classes by scanning the text of `index.html`, so:

- **Write class names as complete strings.** `'bg-rose-500/15'` works.
  `` `bg-${color}-500` `` does not: the class is assembled at runtime and is never
  compiled. Use a lookup of full class names instead.
- **Stick to Tailwind v3 syntax.** The script uses v3.4.17, the same major version the
  Play CDN served before. Arbitrary values such as `max-w-[540px]` and opacity
  modifiers such as `bg-slate-900/95` are fine.
- **Don't edit the generated CSS by hand.** The next run overwrites it. Put custom
  styles in the hand-written `<style>` block in `<head>`.
- **Keep exactly one `<style id="tailwind-css">` block.** The script stops with an
  error otherwise.
- Words in comments that happen to be class names (for example `hidden` or `flex`)
  also get CSS generated. This is harmless and only adds a few bytes.

## Upgrading Tailwind

1. Set `VERSION` in `build-css.py` to the new release tag.
2. Replace every value in `SHA256` with the hashes from that release's
   `sha256sums.txt` on GitHub.
3. Run the script and check the page in a browser.

Stay on v3.x unless you also migrate the page: Tailwind v4 changed its CLI,
configuration and several class defaults.

## Troubleshooting

| Message | Cause and fix |
| --- | --- |
| `No Tailwind standalone CLI for …` | Unsupported OS or CPU. Run the script on a supported machine. |
| `Checksum mismatch …` | The download was corrupted or altered. Delete `~/.cache/tailwindcss-cli` and retry. If it keeps failing, don't override the check. |
| `index.html must contain exactly one <style id="tailwind-css"> block.` | The block was removed or duplicated. Restore a single `<style id="tailwind-css"></style>` at the end of `<head>` and run again. |
| `urllib.error.URLError` / SSL errors | No network, or Python can't verify certificates. On macOS, run *Install Certificates.command* from your Python folder. |
| A new class has no effect | Run the script. If it still doesn't work, check that the class is written as a complete string. |
