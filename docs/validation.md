# Evidence and reproduction

## Primary sources and prior implementations

Consulted the [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3) for parameter inheritance/identity, requiredness, Reference Object behavior and Schema Object vocabulary. The demo declares 3.0.4; the [3.0.4 specification](https://spec.openapis.org/oas/v3.0.4.html) is its versioned reference. The application accepts the 3.0 family and intentionally supports only the documented subset.

[oasdiff](https://github.com/oasdiff/oasdiff) provides a much broader structural diff and explicit client-impact checks. Its [breaking-change documentation](https://github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md) informed the directional treatment of requests versus responses. [OpenAPITools/openapi-diff](https://github.com/OpenAPITools/openapi-diff) already provides compatibility detection and HTML/Markdown/JSON reporting. This project does not claim novelty in API diffing. Its bounded scope combines local source inspection, visible unknowns, annotation recovery and portable review artifacts.

## Independently prepared oracle

A separate reviewer read the upstream YAML documents and prepared `demo/reference-manifest.json` **before inspecting this implementation**. The reviewer recursively compared parsed values and independently inventoried 19 operations. Only two semantic leaves changed. The original source diff also includes trailing whitespace/newline changes, which are not semantic API changes.

`npm run verify:real` checks original and converted source hashes, license hash, every finding's old/new value and pointer against that manifest, exact operation inventory, and agreement with the separately executed oasdiff output. No unverified extra application finding is allowed for the real pair. Source hashes are integrity evidence, not signatures.

## Established implementation comparison

Executed upstream oasdiff **1.34.0**, Linux amd64 release binary, with:

```sh
curl -fL https://github.com/oasdiff/oasdiff/releases/download/v1.34.0/oasdiff_1.34.0_linux_amd64.tar.gz -o /tmp/api-review-oasdiff.tar.gz
mkdir -p /tmp/api-review-oasdiff
tar -xzf /tmp/api-review-oasdiff.tar.gz -C /tmp/api-review-oasdiff
/tmp/api-review-oasdiff/oasdiff --version
/tmp/api-review-oasdiff/oasdiff breaking demo/source/old.yaml demo/source/new.yaml --format json
```

Saved output: `results/oasdiff.json`. Both tools identify the same two required-query-parameter changes as potentially breaking. Our `parameter-required` rule corresponds to oasdiff's `request-parameter-became-required`. There are **no finding disagreements on this pair**. The 262 application coverage entries are not extra change claims; they explicitly describe the narrower analyzer. oasdiff supports many of those constructs. Agreement on two findings is not general equivalence between tools.

## Executable controls and workflow

`tests/engine.test.js` contains labeled synthetic controls for removed operations, required parameters/body, directional request/response enums, primitive types, required response properties, response removal, inherited parameter overrides, local references, cycles, external references, unsupported constructs, document bounds, portable integrity checks and HTML escaping.

`tests/browser/workflow.spec.js` uses the actual converted published revisions. It imports both files, filters and inspects evidence, annotates, reloads, exports/imports a project, rejects altered input hashes while retaining the current review, exports HTML and reopens it with browser networking disabled. A separate mobile viewport case loads the real provenance-backed demo. Testing is Chromium-only; it does not prove behavior of generated clients or deployed servers.

The upstream Petstore descriptions are Apache-2.0; original license text is retained at `demo/source/LICENSE`. All examples are public source descriptions, not captured user data.
