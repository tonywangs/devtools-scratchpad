# Cron Schedule Atlas

Explore named cron expressions in explicit IANA timezones, inspect daylight-saving transitions, compare simultaneous UTC instants, and save findings as portable JSON or standalone HTML. This local simulator never installs or executes scheduled jobs.

## Launch

Requires Python 3.10+ with `venv`, system IANA timezone data, and a modern browser. Tested on Linux with Python 3.12 and Chromium. From this directory:

```sh
./run.sh
```

Open **http://127.0.0.1:8765**. First launch installs the pinned PyYAML dependency if needed (internet required); subsequent launches work offline. Use `./run.sh --port 8766` for another port. Stop with Ctrl-C. The server binds only to loopback. Windows users can create a virtual environment, install `requirements.txt`, and run `python -m atlas.server`; Windows without system timezone data is not supported by this release.

## Try the real-input workflow

1. Click **Load real workflows**. Three pinned Flask and Requests schedules yield **22 occurrences at 12 distinct UTC instants**, including **10 simultaneous instants**, over 2026-10-24 through 2026-11-03 (exclusive).
2. Duplicate the Flask schedule, set its **Simulation IANA timezone** to `America/New_York`, and evaluate. Its midnight occurrences move from 04:00Z to 05:00Z after the November transition. The original imported expression/timezone remain visible.
3. Select a timeline dot or table row to inspect the local offset, fold, annotation, and source hash. Change the timeline window or enable **Simultaneous only** to narrow the view.
4. Add an annotation. Reload to recover the draft; **Recover previous draft** restores the preceding saved edit. Edits save on change/blur, not every keystroke. Results must be recomputed after reload or editing.
5. Save a project JSON; export a report as JSON and offline HTML. Open the HTML directly with networking disabled. Open report JSON in the app to restore settings and recompute; it does not silently reuse old results.
6. Import `fixtures/sources/pallets-flask/lock.yaml` or paste a user crontab. Commands are inert text. A crontab without `CRON_TZ` needs an explicit simulation timezone. Source panels can compare another file to the stored SHA-256 without overwriting the snapshot.

A ready-to-open [sample HTML report](examples/real-workflows.html) and [portable report JSON](examples/real-workflows.json) contain the real demo. No live GitHub connection is needed to use bundled examples. Sources and original licenses are under `fixtures/sources`; [the manifest](fixtures/manifest.json) records immutable revisions, URLs and hashes.

## Semantics and boundaries

Five numeric fields: minute 0–59, hour 0–23, day 1–31, month 1–12, weekday 0–7 (0 and 7 are Sunday). Supports `*`, comma lists, ascending inclusive ranges, and positive steps on wildcards/ranges. Step sizes cannot exceed field width. Single-value steps, names, macros, seconds/year fields, `L`, `W`, `#`, `?`, random and hashed extensions are rejected. Each imported schedule is accounted for as supported, unsupported, or failed; errors are never silently skipped.

Day-of-month and day-of-week use **AND when either textual field begins with `*`; OR otherwise**. Thus `0 0 */2 * 1` requires an odd date and Monday. This is an explicitly selected Vixie-style compatibility policy, not a universal cron dialect.

Nonexistent local minutes yield no instant. Repeated local minutes may yield two distinct instants. UTC boundaries are minute-aligned and use `[start, end)`. Offsets, fold flags, engine/Python versions, system tzdb version and zone-file hashes are recorded. Dates use the Gregorian calendar without leap seconds. Simultaneous means equal scheduled UTC instants, not overlapping execution durations.

Limits: 24 schedules and sources, 366 days, years 2000–2100, 10,000 total occurrences, 8 seconds per evaluation, two active evaluations, 128 KiB per source, and 1 MiB per API request. Cancellation stops the browser request; server work expires within the evaluation budget. Truncated results are visibly incomplete and are not necessarily a chronological prefix across schedules. An empty interval does not establish impossibility; calendar-impossible schedules are labeled separately.

Imports support GitHub workflow YAML `on.schedule` and user crontabs, not system crontab user columns. YAML anchors, tags, aliases, duplicate keys and excessive nesting are rejected. Hashes detect changed snapshots; they do not authenticate user-provided URLs or metadata. Browser storage is local to the origin; export JSON for backup or another device. Large portable reports can be opened because only their project is sent to the server; projects themselves remain subject to the 1 MiB request bound.

**Matching does not guarantee execution.** Hosted scheduling, daemon catch-up, queues, missed runs and job execution are outside scope. In particular GitHub's documented spring-gap policy can advance jobs to the next valid time; Atlas skips nonexistent minutes. See [sources and validation](docs/validation.md).

## Verify and reproduce

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
PLAYWRIGHT_BROWSERS_PATH=.venv/browsers .venv/bin/python -m playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=.venv/browsers .venv/bin/python -m unittest discover -v
.venv/bin/python scripts/verify_sources.py
.venv/bin/python scripts/verify_sources.py --remote
.venv/bin/python scripts/sample_report.py
```

Chromium requires its host system libraries. Remote verification downloads only the five pinned public files and compares bytes, without overwriting fixtures. Tests independently enumerate UTC minutes and compare full occurrence sets; UTC controls also use pinned croniter 6.0.0. Browser tests launch their own ephemeral loopback server and exercise import, timezone comparison, inspection, annotations, recovery, portable export, offline reopening, hostile text and incomplete results. No scheduled commands are run. See [validation details](docs/validation.md) for independence limits.
