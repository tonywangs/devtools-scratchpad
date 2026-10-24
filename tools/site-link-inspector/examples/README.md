# Real input provenance

The bundled `mdn/` files are an unmodified subset of
<https://github.com/mdn/beginner-html-site-styled>, revision
`6c7a360ddb4a0d75be06044bf8a914f260ff10c7`.

Upstream is a public, one-page beginner HTML/CSS website. Its repository includes a CC0-1.0 dedication, retained verbatim at `mdn/LICENSE`. The image is upstream's Firefox icon; trademark rights are not conveyed by CC0. `provenance.json` records SHA-256 hashes of all four bundled files. The demo verifies them before building. Nothing is downloaded when running the demo.

To reproduce acquisition from the pinned public source in a temporary directory:

```sh
curl --fail --location https://codeload.github.com/mdn/beginner-html-site-styled/tar.gz/6c7a360ddb4a0d75be06044bf8a914f260ff10c7 -o /tmp/mdn-site.tar.gz
mkdir -p /tmp/mdn-site-source
tar -xzf /tmp/mdn-site.tar.gz --strip-components=1 -C /tmp/mdn-site-source
```

Compare upstream `LICENSE`, `index.html`, `images/firefox-icon.png`, and `styles/style.css` with the bundled files. Other upstream repository administration files are not needed to build or run this site. Upstream source and license are directly available at <https://github.com/mdn/beginner-html-site-styled/tree/6c7a360ddb4a0d75be06044bf8a914f260ff10c7>.

Run `python3 scripts/demo.py` from the project root. For this handwritten static site the build is a byte-for-byte copy of the HTML, stylesheet and image into `build/demo/site/`. The build is bounded: one HTML page and two local assets. The demo then copies this result into `controlled-site/` and adds a clearly labeled section plus three control files. It never modifies the original fixture. Outputs are ignored by Git and recreated on each run.

The controlled copy adds exactly eight occurrences: three deliberate failures and five successes covering a local anchor, root-relative query-bearing stylesheet, directory index and anchor, script source, and percent-encoded filename/Unicode anchor. These examples extend coverage; they are synthetic controls, not real upstream defects. `scripts/check_browser.mjs` uses an independent Node server and browser DOM checks to verify these outcomes.
