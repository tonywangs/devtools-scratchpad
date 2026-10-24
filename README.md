# Personal Developer Tools

Independent utilities collected into one private repository. Each lives under `tools/<name>/`; run its installation and commands from that directory. This is a source consolidation, not a unified application.

Original repositories and server workspaces were retained. Original histories are reachable through merge commits and `history/` tags. Unpublished source was copied from the server; it may be incomplete.

- [local-llm-prompt-diff](tools/local-llm-prompt-diff/README.md): Offline CLI for comparing prompt-template revisions, identifying structural and textual changes, and generating deterministic JSON/HTML review reports without sending prompts to any model or API.
- [site-link-inspector](tools/site-link-inspector/README.md): An offline static-site link inspector with a browsable report showing broken navigation, missing assets, invalid anchors, and the source locations responsible.
- [har-waterfall-desk](tools/har-waterfall-desk/README.md): An offline HAR inspection workbench with a request waterfall, explicit timing uncertainties, saved annotations, and portable diagnostic reports.
- [webfont-subset-desk](tools/webfont-subset-desk/README.md): A local workbench for creating text-specific webfont subsets, inspecting missing characters, and comparing original and exported rendering.
- [patch-review-desk](tools/patch-review-desk/README.md): A local patch-review application with navigable changes, source-linked annotations, persistent review progress, and portable offline reports.
- [api-change-review](tools/api-change-review/README.md): A local OpenAPI revision viewer that explains API contract changes with source references, explicit compatibility rules, and portable review reports.
- [dependency-license-desk](tools/dependency-license-desk/README.md): A local npm dependency-license workbench linking declared licenses to package evidence, missing information, and portable review notes.
- [cron-schedule-atlas](tools/cron-schedule-atlas/README.md): A local cron schedule explorer for inspecting upcoming occurrences, timezone transitions, and simultaneous scheduled times through an interactive timeline.
