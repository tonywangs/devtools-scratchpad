# Real capture provenance

The sample is MDN's [beginner-html-site-styled](https://github.com/mdn/beginner-html-site-styled), revision `6c7a360ddb4a0d75be06044bf8a914f260ff10c7`. Its original CC0 license is preserved at `fixtures/site/LICENSE`; source files are unchanged. We retain index.html, styles/style.css and images/firefox-icon.png. The unmodified page references a third-party Google font. We deliberately do not acquire or bundle that font.

Acquisition for each of those files and LICENSE:

```sh
curl -fLsS https://raw.githubusercontent.com/mdn/beginner-html-site-styled/6c7a360ddb4a0d75be06044bf8a914f260ff10c7/index.html -o fixtures/site/index.html
```

Repeat with the other relative paths, creating parent directories. All file hashes, source revision, capture date, Chromium version and recording settings are retained in `fixtures/provenance.json`.

Re-record (network required, changes fixture hashes and measured results):

```sh
npm ci
npx playwright install chromium
npm run capture
node scripts/analyze.mjs
npm run verify
```

The capture script starts its own loopback fixture server. It opens fresh headless Chromium contexts, records full HAR metadata without response bodies, blocks service workers, uses a 1280×800 viewport, and waits for network idle. Playwright routing restricts public requests to the public site's origin and local requests to the local origin. Routing disables browser HTTP cache, so these are cold-context, routed observations, not representative performance benchmarks. No artificial public-site delay is added. Public deployment was observed live; the pinned source is a reproducible local counterpart, not a proof of GitHub Pages deployment revision.

Public capture: 4 entries, three HTTP 200s and one browser-failed insecure font request. The public font failed before the route handler (blocked list empty); the capture's `_failureText` is evidence, not a proven diagnosis. Local capture: 7 entries, four 200s, one 302, one 503 and one deliberately route-blocked font. The extra local fetches are `/control/slow` (350 ms server timer), `/control/redirect` (302) and its `/control/failure` target (503). These are labeled controls, not public-site findings.

`recordHar.content: omit` omits response bodies only; do not use this as a general sanitization guarantee. Source hashes refer to exact original bytes. Browser/proxy timing fields can be surprising (including SSL/connect inconsistencies in this environment); the workbench surfaces them rather than rewriting the recording.
