import { readFile, writeFile } from "node:fs/promises";
import { project, standalone } from "../public/report.js";
const p = await project(
  {
    old: await readFile("demo/old.json", "utf8"),
    new: await readFile("demo/new.json", "utf8"),
  },
  JSON.parse(await readFile("demo/provenance.json", "utf8")).sources,
);
await writeFile("demo/sample.project.json", JSON.stringify(p, null, 2) + "\n");
await writeFile("demo/sample.html", standalone(p));
console.log(
  `${p.report.findings.length} findings; ${p.report.coverage.length} unresolved coverage entries`,
);
