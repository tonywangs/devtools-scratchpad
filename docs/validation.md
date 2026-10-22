# Semantics, sources and reproducible validation

## Primary references and existing implementations

Consulted 2026-10-22:

- [Cronie crontab manual](https://github.com/cronie-crond/cronie/blob/master/man/crontab.5): field ranges, lists, steps and the distinction between schedule fields and commands. Atlas deliberately implements a smaller numeric dialect.
- [Python zoneinfo documentation](https://docs.python.org/3/library/zoneinfo.html): IANA database lookup and fold representation. Atlas generates local candidates and roundtrips both fold flags through UTC, rejecting non-roundtripping gap times.
- [croniter](https://github.com/pallets-eco/croniter): established expression iteration and day-field options. Tests pin 6.0.0 and use `implement_cron_bug=True` to match Atlas's starts-with-asterisk AND policy. Default croniter OR behavior can disagree on wildcard steps; this is an explicit dialect choice, not evidence of a timezone bug.
- [GitHub Actions schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): default UTC, optional timezone settings, and hosted execution caveats. Its spring-gap advancement differs from Atlas's skipped-minute policy; the bundled original UTC schedules avoid that discrepancy. User-selected timezone comparisons are simulations, not predictions of hosted execution.

This project combines existing cron concepts with local comparison and portable provenance; it makes no novelty claim about cron evaluation.

## Real inputs and provenance

`fixtures/manifest.json` pins Flask at `d086db856be187255b8ec61ef409357393020f32` (BSD-3-Clause) and Requests at `611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60` (Apache-2.0). The manifest identifies three workflow files and both original license files, with byte hashes. `scripts/verify_sources.py --remote` downloads those immutable raw URLs and compares all bytes to the bundled copies. No workflows or payload commands are executed.

The original schedules have no timezone override, so UTC is recorded as their original setting. A duplicated schedule keeps its original expression/timezone and source pointer while its simulation expression/timezone may change. Source snapshots and metadata travel with project and report exports. The source hash verifies bytes, not authorship or the truth of user-supplied metadata.

## Frozen controls and independent oracle

The existing `fixtures/cases.json` records expectations and intervals as frozen on 2026-10-22 before evaluation. The current work retains these expectations unchanged; the snapshot alone is not an external timestamp proof of that ordering.

Production enumerates local dates and valid wall-time candidates. `tests/oracle.py` instead walks every UTC minute and applies a separately implemented membership predicate. It imports no production parser or evaluator. Both use the same system zoneinfo database: this tests enumeration independently, not IANA's underlying political/historical data. UTC cases additionally compare full sets with croniter 6.0.0. Impossible February 30 is excluded from croniter iteration and checked directly.

Controls cover all three real schedules, a New York spring gap and autumn fold, Lord Howe's half-hour fold, Kathmandu's non-hour offset, leap day, month boundaries, OR day fields, wildcard-step AND day fields, lists/ranges/steps, Sunday 7, impossible schedules and possible schedules outside the search interval. Separate tests cover malformed expressions, import accounting, bounds, cancellation, truncation, changed source hashes and inert text. Tests compare complete occurrence sets, not only counts.

No stochastic experiment or random sampling is involved; the exact inputs and interval boundaries determine the expectations. Report IDs are bookkeeping identifiers. `scripts/sample_report.py` uses stable IDs, while recomputation intentionally captures the current engine and timezone metadata.

## Browser evidence

The end-to-end test imports an actual bundled Flask workflow, compares UTC and New York, selects linked timeline/table occurrences, filters, annotates, reloads, recovers a previous draft, exports JSON and HTML, reimports JSON, compares occurrence sets, detects changed source bytes, and reopens HTML with networking disabled. It verifies the HTML's embedded report equals the downloaded JSON and that hostile annotation text creates no script. Additional workflows exercise incomplete import accounting, invalid JSON recovery, interruption and the occurrence cap.

Tests are executable evidence; no production job execution or scheduler timing is measured. Linux/Chromium is the tested platform. Native Safari, Firefox, Windows, screen readers, independent timezone databases and real scheduler execution are not validated here.
