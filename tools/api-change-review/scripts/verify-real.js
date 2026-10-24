import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { compare, pointer } from "../public/engine.js";
const load = async (p) => JSON.parse(await readFile(p, "utf8"));
const [oldDoc, newDoc, ref, provenance, oas] = await Promise.all(
  [
    "demo/old.json",
    "demo/new.json",
    "demo/reference-manifest.json",
    "demo/provenance.json",
    "results/oasdiff.json",
  ].map(load),
);
for (const side of ["old", "new"]) {
  const sha = (p) =>
    readFile(p).then((x) => createHash("sha256").update(x).digest("hex"));
  assert.equal(await sha(`demo/source/${side}.yaml`), ref.source_sha256[side]);
  assert.equal(await sha(`demo/${side}.json`), provenance.sources[side].sha256);
}
assert.equal(
  createHash("sha256")
    .update(await readFile("demo/source/LICENSE"))
    .digest("hex"),
  provenance.license.sha256,
);
const r = compare(oldDoc, newDoc);
assert.equal(r.findings.length, ref.changes.length);
for (const expected of ref.changes) {
  const f = r.findings.find(
    (f) =>
      f.old.pointer === "#" + expected.pointer &&
      f.new.pointer === "#" + expected.pointer,
  );
  assert.ok(f);
  assert.equal(f.severity, "breaking");
  assert.equal(f.rule, "parameter-required");
  assert.equal(f.old.value, expected.old);
  assert.equal(f.new.value, expected.new);
  assert.equal(pointer(oldDoc, f.old.pointer), expected.old);
  assert.equal(pointer(newDoc, f.new.pointer), expected.new);
}
assert.deepEqual(
  r.operations.map((x) => x.operation).sort(),
  ref.operation_inventory.map((x) => `${x.method} ${x.path}`).sort(),
);
assert.deepEqual(
  oas.map((x) => `${x.operation} ${x.path}`).sort(),
  r.findings.map((x) => x.operation).sort(),
);
assert.ok(
  oas.every(
    (x) => x.id === "request-parameter-became-required" && x.level === 3,
  ),
);
assert.ok(r.coverage.some((x) => x.reason.includes("security")));
assert.ok(r.coverage.some((x) => x.reason.includes("additionalProperties")));
console.log(
  `Independent manifest: all ${r.findings.length} findings, ${r.operations.length} operations, provenance hashes and oasdiff agreement verified. ${r.coverage.length} unresolved coverage entries remain.`,
);
