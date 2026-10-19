# Validation method and observed limits

## Reproducible checks

`python -m unittest discover -s tests -v` uses the actual pinned Noto fonts. It checks real export hashes/byte counts, renamed families, Unicode coverage failure, malformed/oversized/restricted input, script/control limits, license confirmation, same-origin restrictions, and explicit controls:

- Ligatures: `office ffi fi`, with liga/kern on and off.
- Kerning: `AVATAR To WA`, on and off.
- Combining marks: `a\u0301 e\u0308 A\u030a`, on and off.
- RTL joining and marks: `السَّلَامُ عَلَيْكُمْ لا`.

The first test run exposed two real failures: blank lines produced an empty HarfBuzz run without positions, and composed equivalents of decomposed combining sequences were absent from the subset. Empty runs are now explicit; NFC/NFD character closure preserves those shaping choices. Exact input text is not normalized or rewritten. These were implementation defects, not evidence that arbitrary fonts always preserve shaping.

## Independent shaping comparison

The application subsets with fontTools, reopens the exported WOFF2, and shapes original/export using HarfBuzz with explicit script, language, direction, liga and kern. It compares ordered decomposed outline SHA-256 hashes, clusters, missing-glyph flags, and all x/y advances and offsets in font units. Glyph IDs can be renumbered, so they are not compared. Any difference or missing glyph blocks export.

`scripts/verify.py` separately reads checked-in packages and uses HarfBuzz's **drawing API** to compare outline commands, rather than the application's fontTools pen hashes. It also checks all source/output hashes, file lengths and article extraction independently. The shaper is independent of the fontTools subsetter, but both oracles use HarfBuzz: this is not a comparison between two independent shaping engines. No baseline text or glyph is silently skipped except documented empty layout runs and tab/newline separators.

Real English/French Article 1: 356 shaped glyphs; Arabic: 116. Both have zero missing glyphs and equal outlines, clusters and all positions. See `results/independent.json`. Generated package `shaping.json` contains full app comparison records. This proves preservation of the selected runs under the recorded settings, not linguistic correctness or coverage of all potential website text.

## Browser comparison

`scripts/browser_test.py` exercises real demo loading, optional-feature configuration, project download, reload/recovery, wrong-font rejection, matching reconnection, project import, UTF-8 text-file import, missing coverage/export rejection, Latin/Arabic build, ZIP download/hash inspection, and `file://` specimen reopening. Both fonts must load before comparison is shown.

For each real demo it draws original/subset text on identical white 2000×800 canvases at 16, 32 and 48 pixels, same baseline positions and direction, and compares all RGBA channels exactly. Non-white pixels are required. Default liga/kern settings are used for the pixel test; disabled-feature preservation is checked by HarfBuzz tests. Long lines may exceed the canvas width, so this pixel test is a clipped view supplemented by whole-run shaping and DOM inspection, not a proof of every pixel of every glyph. Chrome DevTools Protocol verifies all fonts actually used by the original, subset and standalone text nodes are custom fonts, with no system fallback. The standalone page contains only the exported font, embeds it as a data URL and is reopened with network request observation. The result records browser version, requests, font names, glyph counts and pixel differences.

Results and screenshots are actual executions, not illustrative mockups. Browser-specific rasterization may differ on other versions, operating systems or devices. There is no performance benchmark, production website deployment, or claim that a smaller font automatically makes a page faster.
