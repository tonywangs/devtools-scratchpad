# Executed validation

These are software validation artifacts, not a project-control handoff.

- `tests.log`: all 13 Python regression tests passed. They cover supported asset types, missing targets/fragments, base rules, percent decoding, queries, indexes, external skips, unsupported syntax and attributes, empty resources, tag locations, inert scripts/comments, symlink escape, encoding errors, CLI exit codes and report escaping.
- `browser.json`: Chromium 149.0.7827.55 independently verified the real MDN HTML/image/stylesheet and all eight added controls. The three intentional failures were exactly `missing-page.html`, `images/missing-image.png`, and `#absent-anchor`. Five positive controls succeeded. No upstream failure is claimed. The same run passed the offline report workflow, downloaded JSON equality, and a 390-pixel-wide mobile overflow check, with no JavaScript page errors.
- `report-desktop.png` and `report-mobile.png`: screenshots produced by that browser workflow. The desktop image shows the invalid anchor's actual source tag and resolution evidence.
- `install.json`: a wheel built and installed with `pip install .`; the installed entry point was run from a temporary working directory outside the checkout. It inspected the bundled real input in strict mode with exit 0 and rendered the packaged report template.

Reproduce from the repository root:

```sh
python3 -m unittest discover -s tests -v > results/tests.log 2>&1
python3 scripts/demo.py
npm ci
npx playwright install chromium
node scripts/check_browser.mjs
python3 -m venv .venv
.venv/bin/python -m pip install .
python3 scripts/check_install.py
```

For this execution the browser cache was `/tmp/site-inspector-browsers`; use `PLAYWRIGHT_BROWSERS_PATH=/tmp/site-inspector-browsers` to reuse it. The supplied Python lacked pip/ensurepip, so pip was bootstrapped into the local venv from the public PyPA bootstrap script before the installation check. This is an environment setup detail, not a runtime dependency.

The browser oracle deliberately uses Node HTTP and Chromium DOM/URL behavior instead of the inspector's parser or resolver. Root-relative controls are mapped to the controlled site's root on its temporary server. The real input is small (one upstream HTML page); controls extend coverage but do not demonstrate arbitrary production-site compatibility. No network checking, production deployment, JavaScript navigation validation, or remote publication was performed.
