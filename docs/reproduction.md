# Reproducing public demo inputs

The fixture generator reads a public Git checkout and writes deterministic snapshots and a manifest; it never applies the patch or executes upstream code. Click's BSD license is retained separately for each example. Acquisition does require public network access. Normal viewing and verification do not.

```sh
git -c credential.helper= clone https://github.com/pallets/click.git /tmp/patch-review-click
python3 scripts/acquire.py /tmp/patch-review-click
npm run verify:demo
```

`demo/manifest.json` records each full base/target revision, exact generation argument array, SHA-256 for patch/license/source files, source URLs, and upstream change title. `scripts/acquire.py` selects upstream commits `f67c2bb6c2f055c1c7a57cd46c3697fc26a7742e` and `9f0bcdf0d868edfc71435cd0aac2dcc08cf94828`. Patches include all changed files in those commit-parent comparisons; no path subset is hidden. Git uses `--no-ext-diff --no-textconv --binary --full-index --no-renames --unified=3` and explicit `core.quotePath=true`.

The fixtures were acquired from a shallow public clone with sufficient parent history; the full-clone command above avoids dependence on the current branch's depth. Git client versions may change diff heuristics; compare hashes against the retained manifest when regenerating. Original bytes and snapshots are preserved for offline verification.

# Oracle and execution evidence

`npm run verify:demo` uses Git's own `git apply --numstat -z` **only for reading statistics**, not applying patches. It checks file identities and per-file added/deleted counts against the application parser. It separately counts raw hunk headers and compares all parsed hunk counts. Every displayed old/new source line is checked against its respective hash-verified full base/target file snapshot; each hunk's consumed counts must match the header. The program verifies patch and license hashes, then creates sample reports. The checks cover 10 files and 26 hunks across two genuine changes, not arbitrary projects or all Git formats.

`npm test` exercises labeled controls for additions/deletions, modes, renames, quoted Unicode paths, source CR and missing final newline, malformed and unsupported inputs, repeated hunks, duplicate basenames, recovery identity, inert markup, and resource rejection.

`npm run test:browser` exercises real demo import, file filtering, hunk navigation, line annotation, file/hunk decisions, reload recovery, JSON transfer into fresh storage, unchanged original bytes, standalone HTML export and offline reopening, both real patches, and labeled adversarial controls. It records browser version, checks, JavaScript errors, and attempted external requests. The annotated example is generated through the actual download workflow. The test uses Chromium and does not establish cross-browser coverage.

Results are executable evidence, not an assessment of upstream patch correctness. Fixture source snapshots are licensed upstream content, not our implementation. No imported project code is executed.
