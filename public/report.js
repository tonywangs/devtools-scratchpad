import { parse, hash, compare, DISCLAIMER } from "./engine.js";
export const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function project(texts, sources = {}, state = {}) {
  const hashes = { old: await hash(texts.old), new: await hash(texts.new) };
  return {
    format: "api-change-review/project-v1",
    texts,
    sources: {
      old: { name: "Old imported JSON", ...sources.old, sha256: hashes.old },
      new: { name: "New imported JSON", ...sources.new, sha256: hashes.new },
    },
    hashes,
    state: cleanState(state),
    report: compare(parse(texts.old), parse(texts.new)),
  };
}
export function cleanState(state = {}) {
  const severity = ["all", "breaking", "info", "unresolved"].includes(
    state.severity,
  )
    ? state.severity
    : "all";
  const annotations = Object.fromEntries(
    Object.entries(state.annotations || {})
      .filter(([k, v]) => typeof v === "string" && k.length < 4096)
      .map(([k, v]) => [k, v.slice(0, 4000)]),
  );
  return {
    severity,
    query: typeof state.query === "string" ? state.query.slice(0, 200) : "",
    operation: typeof state.operation === "string" ? state.operation : "all",
    annotations,
  };
}
export async function importProject(text) {
  if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
    throw Error("Project exceeds 8 MiB");
  const p = JSON.parse(text);
  if (
    p.format !== "api-change-review/project-v1" ||
    typeof p.texts?.old !== "string" ||
    typeof p.texts?.new !== "string"
  )
    throw Error("Invalid project format");
  const rebuilt = await project(p.texts, p.sources, p.state);
  for (const side of ["old", "new"])
    if (
      rebuilt.hashes[side] !== p.hashes?.[side] ||
      p.sources?.[side]?.sha256 !== p.hashes?.[side]
    )
      throw Error(`${side} description hash mismatch; recovery refused`);
  return rebuilt;
}
export function standalone(p) {
  const e = escapeHTML;
  const rows = p.report.findings
    .map(
      (f, i) =>
        `<article data-severity="${e(f.severity)}"><h2>${i + 1}. ${e(f.operation)}</h2><p><b>${e(f.severity === "breaking" ? "Potentially breaking" : f.severity)}</b> · ${e(f.rule)}</p><p>${e(f.message)}</p><div class="pair">${["old", "new"].map((side) => `<section><h3>${side}</h3><code>${e(p.sources[side].sha256)} ${e(f[side].pointer)}</code><pre>${e(f[side].present ? JSON.stringify(f[side].value, null, 2) : "(absent)")}</pre></section>`).join("")}</div><p>Annotation: ${e(p.state.annotations[f.id] || "(none)")}</p></article>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>API Change Review — saved report</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;background:#f3f5f7;color:#182a39}article,details{background:white;padding:20px;margin:16px 0;border:1px solid #becbd2;border-radius:8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}code,pre{white-space:pre-wrap;overflow-wrap:anywhere}select{padding:8px}h1{color:#12665f}@media(max-width:650px){.pair{grid-template-columns:1fr}}</style><h1>API Change Review</h1><p>${e(DISCLAIMER)}</p><p>${p.report.operations.length} operations accounted for · ${p.report.findings.length} findings · ${p.report.coverage.length} unresolved coverage entries.</p><details><summary>Source identities and saved filters</summary><pre>${e(JSON.stringify({ sources: p.sources, hashes: p.hashes, filters: p.state }, null, 2))}</pre></details><label>Filter findings <select id="filter"><option value="all">All</option><option value="breaking">Potentially breaking</option><option value="info">Informational</option><option value="unresolved">Unresolved</option></select></label>${rows}<details><summary>All operations</summary><pre>${e(JSON.stringify(p.report.operations, null, 2))}</pre></details><details><summary>Unresolved coverage (always applies regardless of filter)</summary><pre>${e(JSON.stringify(p.report.coverage, null, 2))}</pre></details><details><summary>Full old description</summary><pre>${e(p.texts.old)}</pre></details><details><summary>Full new description</summary><pre>${e(p.texts.new)}</pre></details><p>Read-only portable snapshot. Use the JSON project in the local application to resume annotation.</p><script>document.getElementById('filter').onchange=e=>document.querySelectorAll('article').forEach(a=>a.hidden=e.target.value!=='all'&&a.dataset.severity!==e.target.value)</script></html>`;
}
