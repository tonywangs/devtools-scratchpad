# Reproduce verification

Runtime requires Node 20+. Verification additionally uses Python 3 and Playwright Chromium:

```sh
npm ci
npx playwright install chromium
npm test
npm run verify
npm run test:browser
```

In the supplied environment Chromium is preinstalled under `/tmp/jsonl-browsers`; prefix browser commands with `PLAYWRIGHT_BROWSERS_PATH=/tmp/jsonl-browsers`. Else use Playwright's normal installed path, or `CHROMIUM_PATH=/path/to/chromium`.

`npm test` covers overlapping requests, unavailable phases, SSL nesting, multiple pages, redirects, failures, rejected ordinals, inert export strings, invalid calendar dates and resource limits. These are labeled synthetic controls, separate from real recordings.

`npm run verify` uses an independent Python standard-library implementation directly against raw real captures and saved JSON reports. It verifies hashes, original request count and references, status summaries, chronological ordering, phase values, SSL exclusion, summed durations and elapsed activity. It does not import the JavaScript model. To deliberately regenerate sample reports after model changes, run `node scripts/analyze.mjs` before verification. Do not regenerate captures merely to repeat verification.

`npm run test:browser` starts its own server, exercises real-capture import, page/URL/method/status/type filters, request details, notes, reload recovery, project transfer, wrong-hash rejection, JSON and standalone HTML downloads, and checks for external requests and script execution from a malicious note. It saves the workbench screenshot. Tests operate on bundled fixtures, without public network access.

## Independent existing viewer comparison

Pinned viewer source: Jan Odvarko's HAR Viewer, revision `579969c6bb5537e0ddb358c6a273325eed16fe18`, BSD licensed. No viewer code is copied into this project. To repeat:

```sh
git clone https://github.com/janodvarko/harviewer.git /tmp/har-desk-independent-viewer
git -C /tmp/har-desk-independent-viewer checkout 579969c6bb5537e0ddb358c6a273325eed16fe18
python3 -m http.server 4176 --bind 127.0.0.1 --directory /tmp/har-desk-independent-viewer/webapp
# In another terminal:
node scripts/compare-viewer.mjs
```

The browser harness pastes the unchanged public HAR into this independent viewer and saves rendered row data and a screenshot. Validation is disabled because Playwright's failure sentinel -1 and duration -1 are outside standard HAR schema. The comparison asserts all four URLs, statuses and raw durations; the viewer displays 288.70 ms activity, agreeing with this project's 288.699951171875 ms before rounding. Individual rendered durations may round phase sums differently from raw entry.time (e.g. 158.70 vs 158.684 ms). The legacy viewer renders failed duration as -1.00 ms; our workbench labels it unknown. This comparison is not proof that either viewer handles all HAR producers correctly.

Saved evidence: `results/viewer-comparison.json`, `results/independent-viewer.png`, sample JSON/HTML reports and `results/workbench.png`. Tests intentionally do not claim representative real-world performance or root-cause identification.
