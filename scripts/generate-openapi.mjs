import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const apiRoot = join(root, "src", "app", "api");

function walk(dir) {
  return readdir(dir, { withFileTypes: true }).then((entries) =>
    Promise.all(
      entries.map((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      }),
    ).then((groups) => groups.flat()),
  );
}

function yamlString(value) {
  return JSON.stringify(value);
}

const files = (await walk(apiRoot)).filter((file) => /route\.tsx?$/.test(file));
const paths = new Map();

for (const file of files) {
  const rel = relative(apiRoot, file).replaceAll(sep, "/");
  const route = `/api/${rel.replace(/\/route\.tsx?$/, "")}`
    .replace(/\[([^\]]+)\]/g, "{$1}")
    .replace(/\/+/g, "/");
  const source = await readFile(file, "utf8");
  const methods = [
    ...source.matchAll(
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
    ),
  ].map((match) => match[1]);
  if (!methods.length) continue;
  if (!paths.has(route)) paths.set(route, []);
  paths.get(route).push(...methods);
}

const lines = [
  "openapi: 3.0.3",
  "info:",
  "  title: Haraj Station API",
  "  version: 1.0.0",
  "  description: Generated inventory of route handlers. Request and response schemas are being added per mobile contract.",
  "servers:",
  "  - url: https://harajstation.com",
  "paths:",
];

for (const route of [...paths.keys()].sort()) {
  lines.push(`  ${yamlString(route)}:`);
  for (const method of [...new Set(paths.get(route))].sort()) {
    lines.push(`    ${method.toLowerCase()}:`);
    lines.push(`      summary: ${yamlString(`${method} ${route}`)}`);
    lines.push("      responses:");
    lines.push('        "200":');
    lines.push("          description: Successful response");
    lines.push('        "4XX":');
    lines.push("          description: Error response");
  }
}

await mkdir(join(root, "docs"), { recursive: true });
await writeFile(join(root, "docs", "openapi.yaml"), `${lines.join("\n")}\n`, "utf8");
console.log(`generated ${paths.size} documented paths`);
