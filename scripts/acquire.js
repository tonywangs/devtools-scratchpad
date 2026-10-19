import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import YAML from "yaml";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const revisions = {
  old: "f1ed336a08b18ba4a86c496147c4f546ae965a7b",
  new: "9fb97b14d3c9d15d99aa8e3dbe323284cceb6bee",
};
const expected = {
  old: "7c1315ff7d191c2470e1f5fc9c9f7de1c7aacd162f24eaaf0174f88e1b7d9b1d",
  new: "ce2fca7e5726ddceff7b0c1b7fb9654fb784ed02c76256839a4858311d2f676b",
};
const fetchText = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${r.status} ${url}`);
  return r.text();
};
await mkdir("demo/source", { recursive: true });
const sources = {};
for (const [side, revision] of Object.entries(revisions)) {
  const url = `https://raw.githubusercontent.com/swagger-api/swagger-petstore/${revision}/src/main/resources/openapi.yaml`;
  const yaml = process.argv.includes("--download")
    ? await fetchText(url)
    : await readFile(`demo/source/${side}.yaml`, "utf8");
  if (sha(yaml) !== expected[side]) throw Error("Upstream hash mismatch");
  const json = JSON.stringify(YAML.parse(yaml), null, 2) + "\n";
  await writeFile(`demo/source/${side}.yaml`, yaml);
  await writeFile(`demo/${side}.json`, json);
  sources[side] = {
    name: `Swagger Petstore ${side}`,
    revision,
    url,
    repository: "https://github.com/swagger-api/swagger-petstore",
    license: "Apache-2.0",
    licenseURL: `https://github.com/swagger-api/swagger-petstore/blob/${revision}/LICENSE`,
    originalSHA256: sha(yaml),
    sha256: sha(json),
    conversion:
      "yaml 2.8.3 parse → JSON.stringify(value,null,2) + newline; semantic content preserved",
  };
}
const licenseURL = `https://raw.githubusercontent.com/swagger-api/swagger-petstore/${revisions.new}/LICENSE`;
const license = process.argv.includes("--download")
  ? await fetchText(licenseURL)
  : await readFile("demo/source/LICENSE", "utf8");
await writeFile("demo/source/LICENSE", license);
await writeFile(
  "demo/provenance.json",
  JSON.stringify(
    {
      sources,
      license: { url: licenseURL, sha256: sha(license) },
      note: "Upstream demonstration API, genuine published revisions; not production traffic or deployed behavior evidence.",
    },
    null,
    2,
  ) + "\n",
);
console.log("Pinned sources verified and JSON conversion reproduced");
