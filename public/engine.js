// Pure, bounded OpenAPI 3.0 JSON analysis. No network access.
export const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];
export const LIMITS = {
  bytes: 2 * 1024 * 1024,
  depth: 64,
  nodes: 100000,
  operations: 200,
  findings: 10000,
};
export const DISCLAIMER =
  "Static contract analysis, not observed server behavior. Potentially breaking means an existing client may be affected. Unresolved coverage requires manual review; no clean bill of compatibility is implied.";
export const esc = (s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1");
const at = (p, k) => `${p}/${esc(k)}`;
const obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, k) => obj(v) && Object.hasOwn(v, k);
export function pointer(doc, p) {
  if (p === "#") return doc;
  if (!p?.startsWith("#/")) return undefined;
  let value = doc;
  for (const token of p.slice(2).split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (value == null || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
const stable = (v) =>
  v === undefined
    ? "undefined"
    : JSON.stringify(v, (_, x) =>
        obj(x)
          ? Object.fromEntries(
              Object.keys(x)
                .sort()
                .map((k) => [k, x[k]]),
            )
          : x,
      );
const eq = (a, b) => stable(a) === stable(b);
export function parse(text) {
  if (new TextEncoder().encode(text).length > LIMITS.bytes)
    throw Error("Description exceeds 2 MiB");
  const doc = JSON.parse(text);
  validate(doc);
  return doc;
}
export function validate(doc) {
  if (
    !obj(doc) ||
    !/^3\.0\.\d+$/.test(doc.openapi) ||
    !obj(doc.paths) ||
    !obj(doc.info)
  )
    throw Error("Expected an OpenAPI 3.0 JSON object with info and paths");
  let nodes = 0,
    ops = 0;
  function visit(v, d) {
    if (++nodes > LIMITS.nodes || d > LIMITS.depth)
      throw Error("Document node/depth limit exceeded");
    if (v && typeof v === "object")
      for (const x of Object.values(v)) visit(x, d + 1);
  }
  visit(doc, 0);
  for (const p of Object.values(doc.paths))
    for (const m of METHODS) if (own(p, m)) ops++;
  if (ops > LIMITS.operations)
    throw Error("At most 200 operations per description");
}
export async function hash(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const metadata = new Set([
  "description",
  "summary",
  "title",
  "example",
  "examples",
  "externalDocs",
  "deprecated",
  "tags",
  "operationId",
]);
const supported = {
  schema: new Set(["type", "enum", "required", "properties", "items"]),
  parameter: new Set(["name", "in", "required", "schema"]),
  body: new Set(["required", "content"]),
  response: new Set(["content"]),
  media: new Set(["schema"]),
  operation: new Set(["parameters", "requestBody", "responses"]),
};
export function compare(oldDoc, newDoc) {
  validate(oldDoc);
  validate(newDoc);
  const findings = [],
    coverage = [],
    operations = [];
  const coverageKeys = new Set();
  let steps = 0;
  function gap(side, p, reason, operation = "Document") {
    const key = stable([side, p, reason, operation]);
    if (coverageKeys.has(key)) return;
    coverageKeys.add(key);
    coverage.push({ side, pointer: p, reason, operation });
    if (coverage.length > LIMITS.findings)
      throw Error("Coverage limit exceeded");
  }
  function emit(rule, severity, operation, ap, bp, a, b, message) {
    const f = {
      rule,
      severity,
      operation,
      old: { pointer: ap, present: a !== undefined, value: a ?? null },
      new: { pointer: bp, present: b !== undefined, value: b ?? null },
      message,
    };
    f.id = stable([rule, operation, ap, bp]);
    findings.push(f);
    if (findings.length > LIMITS.findings)
      throw Error("Finding limit exceeded");
  }
  function resolve(v, p, doc, side, op, seen) {
    const chain = new Set(seen);
    while (obj(v) && own(v, "$ref")) {
      const ref = v.$ref;
      if (Object.keys(v).length > 1)
        gap(
          side,
          p,
          "Reference siblings are ignored in OpenAPI 3.0; inspect manually",
          op,
        );
      if (typeof ref !== "string" || !ref.startsWith("#/")) {
        gap(
          side,
          at(p, "$ref"),
          "External or unsupported reference: never fetched",
          op,
        );
        return { v: undefined, p, blocked: true, chain };
      }
      let target;
      try {
        target = decodeURIComponent(ref);
      } catch {
        gap(side, p, "Invalid reference encoding", op);
        return { v: undefined, p, blocked: true, chain };
      }
      if (chain.has(target) || chain.size >= LIMITS.depth) {
        gap(side, p, "Reference cycle or resolution depth limit", op);
        return { v: undefined, p, blocked: true, chain };
      }
      chain.add(target);
      v = pointer(doc, target);
      p = target;
      if (!obj(v)) {
        gap(side, p, "Missing or invalid local reference target", op);
        return { v: undefined, p, blocked: true, chain };
      }
    }
    return { v, p, blocked: false, chain };
  }
  function walk(
    a,
    b,
    ap,
    bp,
    kind,
    direction,
    op,
    as = new Set(),
    bs = new Set(),
    depth = 0,
  ) {
    if (++steps > LIMITS.nodes || depth > LIMITS.depth)
      throw Error("Analysis expansion limit exceeded");
    const ar = resolve(a, ap, oldDoc, "old", op, as),
      br = resolve(b, bp, newDoc, "new", op, bs);
    a = ar.v;
    b = br.v;
    ap = ar.p;
    bp = br.p;
    if (ar.blocked || br.blocked) {
      const originalA = pointer(oldDoc, ap), originalB = pointer(newDoc, bp);
      if (!eq(originalA, originalB))
        emit(
          "unresolved-reference",
          "unresolved",
          op,
          ap,
          bp,
          originalA,
          originalB,
          "Reference prevents complete comparison",
        );
      return;
    }
    for (const [v, p, side] of [
      [a, ap, "old"],
      [b, bp, "new"],
    ]) {
      if (v !== undefined && !obj(v)) {
        gap(side, p, `Invalid ${kind} object`, op);
      }
      if (obj(v))
        for (const k of Object.keys(v))
          if (!supported[kind]?.has(k) && !metadata.has(k))
            gap(side, at(p, k), `Unsupported ${kind} field: ${k}`, op);
      if (kind === "schema" && obj(v)) {
        if (
          v.type !== undefined &&
          ![
            "string",
            "number",
            "integer",
            "boolean",
            "object",
            "array",
          ].includes(v.type)
        )
          gap(side, at(p, "type"), "Unsupported or invalid type", op);
        if (
          v.enum !== undefined &&
          (!Array.isArray(v.enum) ||
            v.enum.some((x) => x !== null && typeof x === "object"))
        )
          gap(side, at(p, "enum"), "Only primitive enum values supported", op);
        if (
          v.required !== undefined &&
          (!Array.isArray(v.required) ||
            v.required.some((x) => typeof x !== "string"))
        )
          gap(side, at(p, "required"), "Invalid required property list", op);
      }
    }
    if ((a !== undefined && !obj(a)) || (b !== undefined && !obj(b))) {
      if (!eq(a, b))
        emit(
          "unresolved-shape",
          "unresolved",
          op,
          ap,
          bp,
          a,
          b,
          "Invalid object shape",
        );
      return;
    }
    const child = (av, bv, ak, bk, k, dir = direction) =>
      walk(
        av,
        bv,
        at(ap, ak),
        at(bp, bk),
        k,
        dir,
        op,
        ar.chain,
        br.chain,
        depth + 1,
      );
    for (const k of new Set([
      ...Object.keys(a || {}),
      ...Object.keys(b || {}),
    ])) {
      const av = a?.[k],
        bv = b?.[k],
        pa = at(ap, k),
        pb = at(bp, k);
      if (kind === "operation" && k === "parameters") {
        parameters(av, bv, pa, pb, op, ar.chain, br.chain, depth + 1);
        continue;
      }
      if (
        (kind === "schema" && k === "properties") ||
        (k === "content" && ["body", "response"].includes(kind)) ||
        (kind === "operation" && k === "responses")
      ) {
        const next =
          k === "properties"
            ? "schema"
            : k === "content"
              ? "media"
              : "response";
        if ((av !== undefined && !obj(av)) || (bv !== undefined && !obj(bv))) {
          gap("old", pa, "Invalid map", op);
          gap("new", pb, "Invalid map", op);
          continue;
        }
        for (const key of new Set([
          ...Object.keys(av || {}),
          ...Object.keys(bv || {}),
        ])) {
          const x = av?.[key],
            y = bv?.[key];
          if (x === undefined || y === undefined) {
            let severity = "unresolved";
            if (k === "responses")
              severity = y === undefined ? "breaking" : "unresolved";
            if (k === "content")
              severity =
                y === undefined
                  ? "breaking"
                  : direction === "request"
                    ? "info"
                    : "unresolved";
            if (k === "properties")
              severity =
                direction === "response" && y === undefined
                  ? "breaking"
                  : direction === "request" && y === undefined
                    ? "unresolved"
                    : "info";
            emit(
              `${k}-${y === undefined ? "removed" : "added"}`,
              severity,
              op,
              at(pa, key),
              at(pb, key),
              x,
              y,
              `${k} entry ${key} ${y === undefined ? "removed" : "added"}; review client assumptions`,
            );
          }
          walk(
            x,
            y,
            at(pa, key),
            at(pb, key),
            next,
            k === "responses" ? "response" : direction,
            op,
            ar.chain,
            br.chain,
            depth + 1,
          );
        }
        continue;
      }
      if (
        (k === "schema" && ["parameter", "media"].includes(kind)) ||
        (k === "items" && kind === "schema") ||
        (k === "requestBody" && kind === "operation")
      ) {
        child(
          av,
          bv,
          k,
          k,
          k === "requestBody" ? "body" : "schema",
          k === "requestBody" ? "request" : direction,
        );
        continue;
      }
      if (eq(av, bv)) continue;
      let rule = "unsupported-change",
        severity = "unresolved",
        message = `${k} changed; manual compatibility review required`;
      if (metadata.has(k)) {
        rule = "metadata-changed";
        severity = "info";
        message = `Documentation field ${k} changed`;
      } else if (k === "required" && ["parameter", "body"].includes(kind)) {
        rule = `${kind}-required`;
        severity = bv === true && av !== true ? "breaking" : "info";
        message =
          bv === true
            ? "Existing callers must now supply this input"
            : "Input is no longer required";
      } else if (
        k === "required" &&
        kind === "schema" &&
        (av === undefined || Array.isArray(av)) &&
        (bv === undefined || Array.isArray(bv))
      ) {
        const added = (bv || []).filter((x) => !(av || []).includes(x)),
          removed = (av || []).filter((x) => !(bv || []).includes(x));
        if (!added.length && !removed.length) continue;
        rule = "schema-required";
        severity = (direction === "request" ? added.length : removed.length)
          ? "breaking"
          : "info";
        message = `Required properties: added ${JSON.stringify(added)}, removed ${JSON.stringify(removed)} (${direction})`;
      } else if (k === "type" && kind === "schema") {
        rule = "schema-type";
        severity =
          (av === undefined && direction === "response") ||
          (bv === undefined && direction === "request")
            ? "info"
            : "breaking";
        message = `${direction} type changed; existing values or client decoders may be affected`;
      } else if (
        k === "enum" &&
        kind === "schema" &&
        (av === undefined || Array.isArray(av)) &&
        (bv === undefined || Array.isArray(bv))
      ) {
        const removed = (av || []).filter(
            (x) => !(bv || []).some((y) => eq(x, y)),
          ),
          added = (bv || []).filter((x) => !(av || []).some((y) => eq(x, y)));
        if (av && bv && !removed.length && !added.length) continue;
        rule = "schema-enum";
        severity = (
          direction === "request"
            ? av === undefined || (bv !== undefined && removed.length)
            : bv === undefined || (av !== undefined && added.length)
        )
          ? "breaking"
          : "info";
        message = `${direction} enum ${direction === "request" ? "restricts accepted inputs when narrowed" : "widens possible outputs when expanded"}`;
      }
      // A newly added/removed parent already has a finding. Still scan its children for coverage.
      if (a !== undefined && b !== undefined)
        emit(rule, severity, op, pa, pb, av, bv, message);
      else if (
        !["type", "required", "enum"].includes(k) &&
        !metadata.has(k) &&
        !supported[kind]?.has(k)
      )
        emit(rule, severity, op, pa, pb, av, bv, message);
    }
    if (kind === "body" && a === undefined && b !== undefined)
      emit(
        "body-added",
        b.required ? "breaking" : "info",
        op,
        ap,
        bp,
        a,
        b,
        "Request body added",
      );
    if (kind === "body" && b === undefined && a !== undefined)
      emit(
        "body-removed",
        "unresolved",
        op,
        ap,
        bp,
        a,
        b,
        "Request body removed; acceptance of old payloads is unspecified",
      );
    if (kind === "schema" && (a === undefined) !== (b === undefined))
      emit(
        "schema-presence",
        "unresolved",
        op,
        ap,
        bp,
        a,
        b,
        "Schema appeared or disappeared; inspect the containing contract",
      );
  }
  function parameters(a = [], b = [], ap, bp, op, as, bs, depth) {
    function index(v, p, doc, side, seen) {
      const out = new Map();
      if (!Array.isArray(v)) {
        gap(side, p, "Invalid parameter array", op);
        return out;
      }
      v.forEach((raw, i) => {
        const r = resolve(raw, at(p, i), doc, side, op, seen);
        if (r.blocked) return;
        const key = stable([r.v?.in, r.v?.name]);
        if (!r.v?.in || !r.v?.name)
          gap(side, r.p, "Invalid parameter identity", op);
        if (out.has(key)) gap(side, r.p, "Duplicate parameter identity", op);
        out.set(key, { ...r, raw, pointer: at(p, i) });
      });
      return out;
    }
    const ai = index(a, ap, oldDoc, "old", as),
      bi = index(b, bp, newDoc, "new", bs);
    for (const key of new Set([...ai.keys(), ...bi.keys()])) {
      const x = ai.get(key),
        y = bi.get(key),
        pa = x?.pointer || ap,
        pb = y?.pointer || bp;
      if (!x || !y)
        emit(
          !y ? "parameter-removed" : "parameter-added",
          !y ? "unresolved" : y.v.required ? "breaking" : "info",
          op,
          x?.p || ap,
          y?.p || bp,
          x?.v,
          y?.v,
          !y
            ? "Parameter removed; old input acceptance is unspecified"
            : "Parameter added",
        );
      walk(
        x?.raw,
        y?.raw,
        pa,
        pb,
        "parameter",
        "request",
        op,
        as,
        bs,
        depth + 1,
      );
    }
  }
  // Inherited parameters are merged by (in,name); retain original pointers via refs.
  function effective(doc, item, operation, path, method, side, op) {
    const raw = operation?.parameters,
      inherited = item?.parameters;
    if (
      (raw !== undefined && !Array.isArray(raw)) ||
      (inherited !== undefined && !Array.isArray(inherited))
    ) {
      gap(side, at(at("#/paths", path), method), "Invalid parameter array", op);
      return [];
    }
    const map = new Map();
    for (const [list, base] of [
      [inherited, at(at("#/paths", path), "parameters")],
      [raw, at(at(at("#/paths", path), method), "parameters")],
    ]) {
      const local = new Set();
      (list || []).forEach((v, i) => {
        const p = at(base, i),
          r = resolve(v, p, doc, side, op, new Set());
        const key = r.blocked ? p : stable([r.v?.in, r.v?.name]);
        if (local.has(key)) gap(side, p, "Duplicate parameter identity", op);
        local.add(key);
        map.set(key, { $ref: p });
      });
    }
    return [...map.values()];
  }
  for (const path of new Set([
    ...Object.keys(oldDoc.paths),
    ...Object.keys(newDoc.paths),
  ])) {
    const a = oldDoc.paths[path],
      b = newDoc.paths[path];
    for (const [v, side] of [
      [a, "old"],
      [b, "new"],
    ])
      if (v)
        for (const k of Object.keys(v))
          if (!METHODS.includes(k) && k !== "parameters" && !metadata.has(k))
            gap(
              side,
              at(at("#/paths", path), k),
              "Unsupported path item field (path references are not expanded)",
              "Document",
            );
    for (const method of METHODS) {
      const x = a?.[method],
        y = b?.[method];
      if (x === undefined && y === undefined) continue;
      const op = `${method.toUpperCase()} ${path}`,
        p = at(at("#/paths", path), method);
      const start = findings.length;
      if (x === undefined || y === undefined)
        emit(
          y === undefined ? "operation-removed" : "operation-added",
          y === undefined ? "breaking" : "info",
          op,
          p,
          p,
          x,
          y,
          y === undefined
            ? "Existing client operation removed"
            : "New operation",
        );
      const xa = obj(x) ? {
          ...x,
          parameters: effective(oldDoc, a, x, path, method, "old", op),
        } : x,
        yb = obj(y) ? {
          ...y,
          parameters: effective(newDoc, b, y, path, method, "new", op),
        } : y;
      walk(xa, yb, p, p, "operation", "request", op);
      operations.push({
        operation: op,
        oldPresent: x !== undefined,
        newPresent: y !== undefined,
        findings: findings.length - start,
      });
    }
  }
  for (const [doc, side] of [
    [oldDoc, "old"],
    [newDoc, "new"],
  ])
    for (const k of Object.keys(doc))
      if (
        ![
          "openapi",
          "info",
          "paths",
          "components",
          "tags",
          "externalDocs",
        ].includes(k)
      )
        gap(
          side,
          at("#", k),
          "Global configuration is outside compatibility rules",
        );
  // Raw changed leaves guarantee visibility of edits outside the semantic traversal.
  const covered = (p, side) =>
    findings.some(
      (f) => f[side].pointer === p || p.startsWith(f[side].pointer + "/"),
    );
  function residual(a, b, p = "#") {
    if (eq(a, b)) return;
    if ((obj(a) && obj(b)) || (Array.isArray(a) && Array.isArray(b))) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        residual(a[k], b[k], at(p, k));
      return;
    }
    if (covered(p, "old") || covered(p, "new")) return;
    emit(
      "unclassified-source-change",
      "unresolved",
      "Document",
      p,
      p,
      a,
      b,
      "Source edit not classified by supported semantic rules (including ordering or unused components); inspect manually",
    );
  }
  residual(oldDoc, newDoc);
  return {
    format: "api-change-review/report-v1",
    disclaimer: DISCLAIMER,
    findings,
    operations,
    coverage,
    limits: LIMITS,
  };
}
