# API Change Review

A local OpenAPI 3.0 JSON revision viewer for checking changes that may affect existing clients, inspecting source evidence, and saving a review. **Static specification analysis does not establish deployed server behavior.** This is a deliberately bounded reviewer, not a replacement for a complete OpenAPI validator or oasdiff.

## Launch

Install Node.js 22 or later, then run:

```sh
./launch.sh
```

Open **http://127.0.0.1:4173** and click **Load real Petstore revisions**. No dependencies, accounts, network calls to API servers, or build step are required to use the app. `PORT=4180 ./launch.sh` chooses another loopback port. The browser must support ES modules, Web Crypto and local storage (tested in Chromium).

The bundled [standalone sample report](demo/sample.html) also opens directly from disk without a server. It contains the complete descriptions, two findings, source identities, rule identifiers, operation inventory and unresolved coverage. Its severity filter works offline.

## Review a pair

1. Select old and new **OpenAPI 3.0 JSON** descriptions, then **Compare descriptions**. Each file is limited to 2 MiB. Uploaded descriptions remain in the browser; the server only serves bundled files.
2. Browse the operation inventory, which includes unchanged operations. Filter by severity or search operation, rule and pointer text. Click a finding to inspect old/new values, their document pointers and document SHA-256 identities.
3. Use **Source identities and full descriptions** to inspect arbitrary JSON pointers. `#` selects the full document. Escape `/` as `~1` and `~` as `~0` in property names.
4. Annotate findings with client impact or follow-up. Filters and annotations save locally and recover after reload only with matching hashes for **both exact description byte strings**. Browser storage failure is reported; export JSON for durable recovery. Clearing browser data removes local recovery.
5. **Export JSON project** embeds both descriptions, hashes, source identities, recomputed report and review state. Import through **Resume JSON project**; mismatched hashes are refused before replacing the current review. It is an integrity check, not a signature or proof of source authenticity. Do not edit the embedded documents to carry annotations to another revision.
6. **Export standalone HTML** saves a read-only review with every finding and annotation (regardless of active filters), source descriptions and coverage. It needs no external assets. Resume editable work using JSON. HTML displays saved filter settings and provides its own severity filter.

## Real revision demonstration

The demo uses published Swagger Petstore revisions `f1ed336a08b18ba4a86c496147c4f546ae965a7b` and `9fb97b14d3c9d15d99aa8e3dbe323284cceb6bee`. It is a genuine upstream **demonstration API**, not a production-traffic experiment. Both contain 19 operations. Two query parameters become required: `status` on `GET /pet/findByStatus` and `tags` on `GET /pet/findByTags`. Existing clients that omit them may be affected.

Original YAML, upstream Apache-2.0 license, converted JSON, revision URLs and SHA-256 hashes are bundled under `demo/`. JSON conversion preserves parsed semantics. [Provenance](demo/provenance.json), [independent reference manifest](demo/reference-manifest.json), and [comparison methodology](docs/validation.md) explain the evidence. The unchanged descriptions also contain unsupported features: the report exposes 262 coverage entries, including repeated contexts where component schemas are used by different operations.

## Supported scope and limits

See [compatibility rules](docs/rules.md). Rules cover direct path operations, operation/path parameters (operation overrides inherited parameters by name/location), request bodies, response status/media entries, schemas with primitive types, objects/properties, arrays/items, required property sets and primitive enums. Local references in parameters, bodies, responses and schemas resolve with original target pointers. Repeated references are analyzed per operation. External references, cycles, missing targets, unsupported constructs and unknown fields remain visible without fetching anything.

OpenAPI 2, 3.1 and YAML uploads are rejected. Path Item `$ref`, callbacks, security semantics, servers, serialization (`style`, `explode`, etc.), encoding, response headers, schema composition, constraints, formats, XML, discriminator, nullable/readOnly/writeOnly and additionalProperties are **not** compatibility-analyzed. Coverage lists encountered unsupported fields even if unchanged. Unclassified raw source edits (including unused components or reorderings) become unresolved findings. Unchanged unused components are not analyzed. This is not full schema validation; malformed shapes may be rejected or marked unresolved. A report with no findings is not proof of compatibility.

Limits: 200 direct operations per description, 100,000 input nodes and analysis steps, depth 64, 10,000 findings/coverage entries, 8 MiB JSON project imports, 4,000 characters per annotation. Exceeding an analysis limit rejects the pair rather than silently truncating it. Very large reports may exceed browser local storage capacity; keep portable exports. Runs synchronously in the browser, so large inputs may briefly block the UI. The loopback server is a single-user local tool. Source files and annotations may be sensitive: exported reports embed them.

## Reproduce validation

Development dependencies are locked; the launch path does not require them.

```sh
npm ci --cache /tmp/api-review-npm-cache
node scripts/acquire.js --download
npm run verify:real
npm test
PLAYWRIGHT_BROWSERS_PATH=/tmp/api-review-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/api-review-browsers npm run test:browser
npm run demo:build
```

`node scripts/acquire.js` validates/converts the bundled originals offline. `--download` fetches the pinned public sources and refuses changed hashes. Browser tests exercise genuine inputs through import, filtering, inspection, annotation, reload, hash-matched JSON recovery, mismatch rejection, HTML export and offline reopening. Synthetic controls test other supported rules and unresolved constructs; they are not real-world findings.
