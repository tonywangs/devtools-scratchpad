# Webfont Subset Desk

A local browser workbench for turning a static font and known website text into a smaller WOFF2 package, with missing-character inspection and original/subset comparison.

## Launch

Install Python 3.12+ with `venv` and pip, then run:

```sh
./launch.sh
```

Open **http://127.0.0.1:4173**. First launch installs the pinned Python dependencies from PyPI; subsequent use is local. No account, API key, build step or remote font service is needed. Set `PORT` to change the port. On Debian, missing venv/pip requires the system `python3-venv` package. The server is a single-user development workbench, bound only to loopback; do not expose it to a network.

1. Click **English + French demo** or **Arabic demo**, or import your static TTF/WOFF/WOFF2 and UTF-8 text.
2. Inspect coverage. Missing characters are shown by codepoint and block export. Coverage is a cmap check, not proof of shaping.
3. Select Latin/LTR or Arabic/RTL, language, standard ligatures and kerning. Supply the full license and copyright notices and confirm your rights to modify and redistribute.
4. **Build & compare** runs fontTools subsetting and checks the exported WOFF2 with HarfBuzz. Review the original and exported specimens. Size increases are reported without disguising them as savings.
5. Download the ZIP. Open `specimen.html` directly, or use `style.css` with `subset.woff2` together on your site. Use its generated family and `.specimen` class, and copy the corresponding `lang`/`dir` attributes from the specimen. The package declares normal style, weight 400: choose a regular source for matching semantics.

Text, settings, notices and source SHA-256 persist through browser reload. Reconnect the **identical** source font. Export/import project JSON to transfer settings; it deliberately excludes font binaries. Clear the project to use a different font. Browser storage can be cleared by the browser; project JSON is the portable backup. Local font files are never overwritten.

## Try the exported results

- [English + French standalone specimen](samples/latin/specimen.html)
- [Arabic standalone specimen](samples/arabic/specimen.html)
- [Workbench screenshot](results/latin-workbench.png)

Open these HTML files locally after cloning/downloading. Each embeds its exported WOFF2, hides its text until that font loads, and makes no network requests. Each sample directory is a ready-to-use webfont package: `subset.woff2`, `style.css`, `specimen.html`, `text.txt`, `LICENSE.txt`, `manifest.json`, `shaping.json`.

Measured checked-in samples: Noto Sans 569,208 → 9,644 bytes (98.31% smaller); Noto Naskh Arabic 178,388 → 13,532 bytes (92.41% smaller). These compare source TTF bytes to subset WOFF2, so savings include format compression; they do not isolate repertoire reduction or measure website speed. See [sizes](results/sizes.json), [independent shaping evidence](results/independent.json), and [method and limits](VALIDATION.md).

## Formats, scripts and resource limits

- One static monochrome TrueType-outline font per project, at most 5 MiB; TTF, WOFF and WOFF2 containers. Variable fonts, collections, CFF/OTF, color, bitmap and Graphite fonts are unsupported. Restricted/no-subsetting/bitmap-only embedding flags are rejected. Font licensing remains the user's responsibility.
- Latin and Arabic only, with one explicit script and direction per project. English and French can share a Latin project. No mixed-direction paragraphs, explicit bidi control characters or automatic script itemization. Common/inherited characters may occur; unsupported repertoire still blocks export. Tabs/newlines are layout separators, and ZWJ/ZWNJ are layout controls rather than required cmap entries.
- Maximum 12,000 text characters, 100,000 license characters, 8 MiB request. This is a modest local workflow, not a hardened parser sandbox for hostile fonts. Read trusted licensed fonts only. Serial requests can take seconds.
- All OpenType layout features, layout closure, hinting and name/license records are retained where supported by fontTools. NFC/NFD character closure supplements exact text without modifying the stored text. Optional `liga` and `kern` settings apply to original, subset and CSS. Required shaping is not disabled. Modified fonts get a new family to avoid reserved font names.
- Rebuild when text, language or features change. Equality is checked only for the supplied runs. Cmap coverage alone does not establish correct typography, language support, browser compatibility or all possible combinations.
- Browser validation is for the recorded Chromium build on Linux, at 16/32/48px. Firefox, Safari, other operating systems, vertical layout and print are untested. There is no claim of universal pixel identity.

## Reproduce

```sh
.venv/bin/python -m pip install -r requirements-test.txt
python3 scripts/acquire.py                 # downloads pinned public sources; verifies hashes
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/samples.py         # rebuild sample packages
.venv/bin/python scripts/verify.py          # separate HarfBuzz outline oracle
.venv/bin/python -m playwright install chromium
.venv/bin/python scripts/browser_test.py    # starts/stops its own loopback server
```

`CHROMIUM_PATH=/path/to/chrome-headless-shell` selects an existing browser. Browser installation may require host system libraries. Results contain actual versions. All fixtures are bounded and source files remain unchanged; `acquire.py` verifies current bytes against the manifest before writing them. Unicode's license URL is a dated content-hash snapshot; if upstream terms change the script stops rather than accepting new bytes.

## Sources and licenses

See [SOURCES.md](SOURCES.md) for primary documentation, existing implementations, pinned acquisition sources and obligations. Bundled fonts are SIL OFL 1.1; keep the copyright and license with redistributed or modified fonts, do not sell them alone, respect reserved names, and keep modified fonts under OFL. The demo packages include the complete font and Unicode notices. This program does not grant rights to user-imported fonts.
