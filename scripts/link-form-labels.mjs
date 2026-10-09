import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const write = process.argv.includes("--write");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx$/.test(entry.name) ? [full] : [];
    }),
  );
  return nested.flat();
}
const controlNames = new Set(["input", "select", "textarea"]);
function name(node) {
  const tag = node.tagName;
  return typeof tag.text === "string" ? tag.text : String(tag.escapedText ?? "");
}
function attrs(element) {
  return element.attributes.properties.filter(ts.isJsxAttribute);
}
function hasAttr(element, wanted) {
  return attrs(element).some((attr) => attr.name.text === wanted);
}
function descendantsContainControl(node) {
  let found = false;
  function visit(child) {
    if (found) return;
    if (ts.isJsxSelfClosingElement(child) && controlNames.has(name(child))) found = true;
    if (ts.isJsxElement(child) && controlNames.has(name(child.openingElement))) found = true;
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}
function insertionPoint(opening, source) {
  const end = opening.end;
  return source.slice(Math.max(0, end - 2), end) === "/>" ? end - 2 : end - 1;
}
const rows = [];
for (const file of await walk(join(root, "src"))) {
  const source = await readFile(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  let counter = 0;
  function visit(node) {
    if (
      ts.isJsxElement(node) &&
      name(node.openingElement) === "label" &&
      !hasAttr(node.openingElement, "htmlFor") &&
      !descendantsContainControl(node)
    ) {
      const parent = node.parent;
      if (ts.isJsxElement(parent)) {
        const siblings = parent.children;
        const index = siblings.indexOf(node);
        for (let i = index + 1; i < siblings.length; i++) {
          const sibling = siblings[i];
          let opening = null;
          if (ts.isJsxSelfClosingElement(sibling)) opening = sibling;
          else if (ts.isJsxElement(sibling)) opening = sibling.openingElement;
          if (opening && controlNames.has(name(opening)) && !hasAttr(opening, "id")) {
            const slug = basename(file)
              .replace(/\.tsx$/, "")
              .replace(/[^a-z0-9]+/gi, "-")
              .toLowerCase();
            const id = `a11y-${slug}-${++counter}`;
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            rows.push({ file: relative(root, file), line, id });
            edits.push({ pos: insertionPoint(opening, source), text: ` id="${id}"` });
            edits.push({
              pos: insertionPoint(node.openingElement, source),
              text: ` htmlFor="${id}"`,
            });
            break;
          }
          if (ts.isJsxElement(sibling) && name(sibling.openingElement) === "label") break;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (write && edits.length) {
    edits.sort((a, b) => b.pos - a.pos);
    let output = source;
    for (const edit of edits)
      output = output.slice(0, edit.pos) + edit.text + output.slice(edit.pos);
    await writeFile(file, output, "utf8");
  }
}
console.log(JSON.stringify(rows, null, 2));
console.log(`orphan-label-candidates=${rows.length}${write ? " (written)" : ""}`);
if (!write && rows.length) process.exitCode = 1;
