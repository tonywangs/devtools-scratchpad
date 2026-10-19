import test from "node:test";
import assert from "node:assert/strict";
import { compare, parse, pointer } from "../public/engine.js";
import { project, importProject, standalone } from "../public/report.js";
const base = () => ({
  openapi: "3.0.3",
  info: { title: "Synthetic controls", version: "1" },
  paths: {
    "/pets": {
      get: {
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["a", "b"] },
          },
        ],
        responses: {
          200: {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id"],
                  properties: { id: { type: "string", enum: ["a", "b"] } },
                },
              },
            },
          },
        },
      },
    },
  },
});
const clone = structuredClone;
const param = (d) => d.paths["/pets"].get.parameters[0];
const schema = (d) =>
  d.paths["/pets"].get.responses[200].content["application/json"].schema;
function change(fn) {
  const a = base(),
    b = clone(a);
  fn(b);
  return compare(a, b);
}
const finding = (r, rule) => r.findings.find((f) => f.rule === rule);
test("synthetic removed operation and parameter becoming required", () => {
  assert.equal(
    finding(
      change((d) => delete d.paths["/pets"].get),
      "operation-removed",
    ).severity,
    "breaking",
  );
  const f = finding(
    change((d) => (param(d).required = true)),
    "parameter-required",
  );
  assert.equal(f.severity, "breaking");
  assert.equal(f.new.pointer, "#/paths/~1pets/get/parameters/0/required");
});
test("synthetic request/response enum directions, including removing constraints", () => {
  assert.equal(
    finding(
      change((d) => (param(d).schema.enum = ["a"])),
      "schema-enum",
    ).severity,
    "breaking",
  );
  assert.equal(
    finding(
      change((d) => param(d).schema.enum.push("c")),
      "schema-enum",
    ).severity,
    "info",
  );
  assert.equal(
    finding(
      change((d) => delete param(d).schema.enum),
      "schema-enum",
    ).severity,
    "info",
  );
  assert.equal(
    finding(
      change((d) => schema(d).properties.id.enum.push("c")),
      "schema-enum",
    ).severity,
    "breaking",
  );
  assert.equal(
    finding(
      change((d) => (schema(d).properties.id.enum = ["a"])),
      "schema-enum",
    ).severity,
    "info",
  );
  assert.equal(
    finding(
      change((d) => delete schema(d).properties.id.enum),
      "schema-enum",
    ).severity,
    "breaking",
  );
});
test("synthetic required properties, primitive types, response removal, required body", () => {
  assert.equal(
    finding(
      change((d) => (schema(d).required = [])),
      "schema-required",
    ).severity,
    "breaking",
  );
  assert.equal(
    finding(
      change((d) => (schema(d).properties.id.type = "integer")),
      "schema-type",
    ).severity,
    "breaking",
  );
  assert.equal(
    finding(
      change((d) => delete d.paths["/pets"].get.responses[200]),
      "responses-removed",
    ).severity,
    "breaking",
  );
  assert.equal(
    finding(
      change(
        (d) =>
          (d.paths["/pets"].get.requestBody = { required: true, content: {} }),
      ),
      "body-added",
    ).severity,
    "breaking",
  );
});
test("synthetic local reference points to original component; cycle and external refs visible without fetch", () => {
  const a = base();
  a.components = { schemas: { ID: { type: "string" } } };
  schema(a).properties.id = { $ref: "#/components/schemas/ID" };
  const b = clone(a);
  b.components.schemas.ID.type = "integer";
  const r = compare(a, b);
  assert.equal(
    finding(r, "schema-type").new.pointer,
    "#/components/schemas/ID/type",
  );
  for (const ref of [
    "https://example.invalid/schema.json",
    "#/components/schemas/ID",
  ]) {
    const c = clone(a);
    c.components.schemas.ID = { $ref: ref };
    assert.ok(
      compare(c, c).coverage.some((x) => /cycle|External/.test(x.reason)),
    );
  }
});
test("synthetic unsupported constraints and unclassified source changes remain visible", () => {
  const a = base();
  schema(a).oneOf = [{ type: "string" }];
  schema(a).additionalProperties = false;
  const b = clone(a);
  b.servers = [{ url: "https://example.invalid" }];
  const r = compare(a, b);
  assert.ok(r.coverage.some((c) => c.reason.includes("oneOf")));
  assert.ok(r.coverage.some((c) => c.reason.includes("additionalProperties")));
  assert.ok(r.findings.some((f) => f.rule === "unclassified-source-change"));
});
test("inherited parameter override uses operation identity and original source pointers", () => {
  const a = base();
  a.paths["/pets"].parameters = [
    { name: "q", in: "query", required: true, schema: { type: "string" } },
  ];
  const b = clone(a);
  param(b).required = true;
  const r = compare(a, b);
  assert.equal(
    r.findings.filter((f) => f.rule === "parameter-required").length,
    1,
  );
  assert.equal(finding(r, "parameter-required").old.value, false);
});
test("missing values and pointer escapes are unambiguous", () => {
  assert.equal(pointer({ "a/b": { "~x": false } }, "#/a~1b/~0x"), false);
  assert.equal(pointer({}, "#/constructor"), undefined);
  assert.throws(() => parse('{"openapi":"3.1.0","info":{},"paths":{}}'), /3.0/);
});
test("project recovery checks both raw hashes and recomputes findings, escaped offline export", async () => {
  const a = base(),
    b = clone(a);
  param(b).required = true;
  const p = await project({ old: JSON.stringify(a), new: JSON.stringify(b) });
  p.state.annotations[p.report.findings[0].id] = "<script>alert(1)</script>";
  p.report.findings = [];
  const restored = await importProject(JSON.stringify(p));
  assert.equal(restored.report.findings.length, 1);
  assert.ok(
    standalone(restored).includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
  );
  p.texts.new += " ";
  await assert.rejects(importProject(JSON.stringify(p)), /hash mismatch/);
});
test("limits reject oversized or deeply nested inputs rather than silently truncating", () => {
  assert.throws(() => parse(" ".repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
  const a = base();
  let x = a;
  for (let i = 0; i < 70; i++) {
    x.deep = {};
    x = x.deep;
  }
  assert.throws(() => compare(a, a), /depth/);
});

test('added and removed inherited or referenced parameters expose original evidence', () => {
  for (const referenced of [false, true]) {
    const a = base(), b = clone(a);
    const parameter = {name: 'token', in: 'query', required: true, schema: {type: 'string'}};
    b.components = {parameters: {Token: parameter}};
    b.paths['/pets'].parameters = [referenced ? {$ref: '#/components/parameters/Token'} : parameter];
    for (const [oldDoc, newDoc, side, rule] of [[a, b, 'new', 'parameter-added'], [b, a, 'old', 'parameter-removed']]) {
      const f = finding(compare(oldDoc, newDoc), rule);
      assert.deepEqual(f[side].value, parameter);
      assert.deepEqual(pointer(side === 'old' ? oldDoc : newDoc, f[side].pointer), parameter);
      assert.equal(f[side].pointer, referenced ? '#/components/parameters/Token' : '#/paths/~1pets/parameters/0');
    }
  }
});

test('unresolved reference findings retain actual source objects, not missing placeholders', () => {
  const a = base(), b = clone(a);
  schema(a).properties.id = {$ref: 'https://example.invalid/schema.json'};
  const f = finding(compare(a, b), 'unresolved-reference');
  for (const [side, doc] of [['old', a], ['new', b]]) {
    assert.equal(f[side].present, true);
    assert.deepEqual(f[side].value, pointer(doc, f[side].pointer));
  }
});

test('invalid operation primitives are explicitly unresolved', () => {
  const a = base(); a.paths['/pets'].get = true;
  assert.ok(compare(a, a).coverage.some(c => c.reason === 'Invalid operation object'));
});
