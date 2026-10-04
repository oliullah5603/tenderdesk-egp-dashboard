import { cp, mkdir, rm } from "node:fs/promises";

const root = process.cwd();
const dist = `${root}/dist`;
await rm(dist, { recursive: true, force: true });
await mkdir(`${dist}/server`, { recursive: true });
await mkdir(`${dist}/.openai`, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "cards.css", "cards.js", "auth.css", "auth.js", "favicon.svg"]) {
  await cp(`${root}/${file}`, `${dist}/${file}`);
}
await cp(`${root}/worker/index.js`, `${dist}/server/index.js`);
await cp(`${root}/.openai/hosting.json`, `${dist}/.openai/hosting.json`);
console.log("Built static assets and Worker into dist/");
