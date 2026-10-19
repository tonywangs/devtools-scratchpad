import { pointer, parse, hash } from "./engine.js";
import {
  project,
  importProject,
  standalone,
  escapeHTML as e,
  cleanState,
} from "./report.js";
const $ = (id) => document.getElementById(id);
let current = null,
  selected = null,
  busy = false;
const key = (p) => `api-review-v1:${p.hashes.old}:${p.hashes.new}`;
function status(s) {
  $("status").textContent = s;
}
function save() {
  if (!current) return;
  try {
    localStorage.setItem(
      key(current),
      JSON.stringify({ hashes: current.hashes, state: current.state }),
    );
    localStorage.setItem("api-review-last-v1", JSON.stringify(current));
    $("storageStatus").textContent = "";
  } catch {
    $("storageStatus").textContent =
      "Browser storage is unavailable or full. Export JSON to preserve this review.";
  }
}
function recover(p) {
  try {
    const raw = localStorage.getItem(key(p));
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.hashes.old !== p.hashes.old || saved.hashes.new !== p.hashes.new)
      throw Error("hash mismatch");
    p.state = cleanState(saved.state);
    return true;
  } catch {
    status("Saved state is invalid; recovery refused.");
    return false;
  }
}
async function act(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (err) {
    status(`Error: ${err.message}. Current review has been preserved.`);
  } finally {
    busy = false;
  }
}
function show(p, recovery = false) {
  current = p;
  selected = null;
  $("workspace").hidden = false;
  $("severity").value = p.state.severity;
  $("query").value = p.state.query;
  render();
  save();
  status(
    `${recovery ? "Recovered matching annotations and filters. " : ""}Compared ${p.report.operations.length} operations. ${p.report.findings.length} findings; ${p.report.coverage.length} unresolved coverage entries. No server requests were made.`,
  );
}
async function read(file, max) {
  if (!file) throw Error("Choose both description files");
  if (file.size > max) throw Error("File exceeds size limit");
  return file.text();
}
$("demo").onclick = () =>
  act(async () => {
    const [old, newText, provenance] = await Promise.all(
      ["/demo/old.json", "/demo/new.json", "/demo/provenance.json"].map(
        async (u) => {
          const r = await fetch(u);
          if (!r.ok) throw Error("Demo unavailable");
          return r.text();
        },
      ),
    );
    const sources = JSON.parse(provenance).sources;
    for (const [side, text] of [
      ["old", old],
      ["new", newText],
    ])
      if ((await hash(text)) !== sources[side].sha256)
        throw Error("Demo hash mismatch");
    const p = await project({ old, new: newText }, sources);
    const recovered = recover(p);
    show(p, recovered);
  });
$("compare").onclick = () =>
  act(async () => {
    const old = $("old").files[0],
      next = $("new").files[0];
    const texts = {
      old: await read(old, 2 * 1024 * 1024),
      new: await read(next, 2 * 1024 * 1024),
    };
    const p = await project(texts, {
      old: { name: old.name },
      new: { name: next.name },
    });
    const recovered = recover(p);
    show(p, recovered);
  });
$("project").onchange = () =>
  act(async () => {
    const p = await importProject(
      await read($("project").files[0], 8 * 1024 * 1024),
    );
    show(p);
    save();
    status(
      "Imported project; both description hashes verified. Findings recomputed locally.",
    );
  });
function render() {
  const { report, state, sources } = current;
  $("counts").textContent =
    `${report.findings.length} total findings · ${report.operations.filter((o) => o.findings).length} changed operations · ${report.operations.length} operations accounted for · ${report.coverage.length} coverage questions remain`;
  $("operations").replaceChildren();
  for (const o of report.operations) {
    const b = document.createElement("button");
    b.textContent = `${o.operation} · ${o.findings}`;
    b.setAttribute("aria-pressed", state.operation === o.operation);
    b.onclick = () => {
      state.operation = o.operation;
      save();
      render();
    };
    $("operations").append(b);
  }
  const fs = report.findings.filter(
    (f) =>
      (state.severity === "all" || f.severity === state.severity) &&
      (state.operation === "all" || f.operation === state.operation) &&
      JSON.stringify(f).toLowerCase().includes(state.query.toLowerCase()),
  );
  $("findings").replaceChildren();
  if (!fs.length) {
    const p = document.createElement("p");
    p.textContent =
      "No findings match these filters. Unresolved coverage still applies.";
    $("findings").append(p);
  }
  for (const f of fs) {
    const b = document.createElement("button");
    b.className = "finding";
    b.innerHTML = `<span class="badge ${e(f.severity)}">${e(f.severity === "breaking" ? "Potentially breaking" : f.severity)}</span> <strong>${e(f.operation)}</strong><p>${e(f.message)}</p><code>${e(f.rule)} · ${e(f.new.pointer)}</code>`;
    b.onclick = () => {
      selected = f;
      inspect();
    };
    $("findings").append(b);
  }
  $("coverageTitle").textContent =
    `Unresolved coverage · ${report.coverage.length} entries (not hidden by filters)`;
  $("coverage").innerHTML =
    report.coverage
      .map(
        (c) =>
          `<p><b>${e(c.side)} · ${e(c.operation)}</b><br><code>${e(c.pointer)}</code><br>${e(c.reason)}</p>`,
      )
      .join("") ||
    "<p>No unsupported fields encountered in the traversed operation subset. Global and unused component semantics are not fully analyzed.</p>";
  $("identities").textContent = JSON.stringify(sources, null, 2);
  if (selected && !fs.includes(selected)) selected = null;
  inspect();
}
function inspect() {
  if (!selected) {
    $("inspection").replaceChildren();
    return;
  }
  const f = selected;
  $("inspection").innerHTML =
    `<h2>Inspect evidence</h2><p>${e(f.rule)} · ${e(f.operation)}</p><div class="pair">${["old", "new"].map((s) => `<div><h3>${s}</h3><code>SHA-256 ${e(current.sources[s].sha256)}<br>${e(f[s].pointer)}</code><pre>${e(f[s].present ? JSON.stringify(f[s].value, null, 2) : "(absent at this location)")}</pre></div>`).join("")}</div><label>Review annotation<textarea id="annotation" maxlength="4000" placeholder="Client impact, decision, or follow-up"></textarea></label>`;
  $("annotation").value = current.state.annotations[f.id] || "";
  $("annotation").oninput = () => {
    current.state.annotations[f.id] = $("annotation").value;
    save();
  };
}
$("severity").onchange = () => {
  current.state.severity = $("severity").value;
  save();
  render();
};
$("query").oninput = () => {
  current.state.query = $("query").value;
  save();
  render();
};
$("allOps").onclick = () => {
  current.state.operation = "all";
  save();
  render();
};
$("inspectSource").onclick = () =>
  act(async () => {
    const value = pointer(
      parse(current.texts[$("sourceSide").value]),
      $("sourcePointer").value,
    );
    $("sourceValue").textContent =
      value === undefined
        ? "Pointer not found"
        : JSON.stringify(value, null, 2);
  });
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("json").onclick = () =>
  download(
    "api-review.project.json",
    JSON.stringify(current, null, 2),
    "application/json",
  );
$("html").onclick = () =>
  download("api-review.html", standalone(current), "text/html");

act(async () => {
  const saved = localStorage.getItem("api-review-last-v1");
  if (saved) show(await importProject(saved), true);
});
