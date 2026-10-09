import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { hasStaffPermission, type StaffPermission } from "@/lib/staff-permissions";

const root = process.cwd();
function calls(path: string, name: string) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? pages(path) : entry.name === "page.tsx" ? [path] : [];
  });
}

describe("admin authorization coverage", () => {
  it("requires an explicit scope on every resource page", () => {
    const exceptions = new Set([
      "page.tsx",
      "account/page.tsx",
      "staff/page.tsx",
      "forbidden/page.tsx",
    ]);
    for (const path of pages(join(root, "src/app/admin"))) {
      const name = relative(join(root, "src/app/admin"), path).replaceAll("\\", "/");
      if (exceptions.has(name)) continue;
      expect(
        calls(path, "requireStaff").some(
          (call) => call.arguments.length === 2 && ts.isStringLiteral(call.arguments[1]),
        ),
        name,
      ).toBe(true);
    }
  });

  it("does not add an unscoped admin mutation outside team management", () => {
    const path = join(root, "src/app/admin/actions.ts");
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const teamOnly = new Set([
      "createStaffAction",
      "updateStaffRoleAction",
      "updateStaffPermissionsAction",
      "removeStaffAction",
      "resetStaffTotpAction",
    ]);
    const missing: string[] = [];
    const visit = (node: ts.Node, owner = "") => {
      if (ts.isFunctionDeclaration(node) && node.name) owner = node.name.text;
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "mutation" &&
        !teamOnly.has(owner)
      ) {
        const last = node.arguments.at(-1);
        if (!last || !ts.isStringLiteral(last)) missing.push(owner);
      }
      ts.forEachChild(node, (child) => visit(child, owner));
    };
    visit(source);
    expect(missing).toEqual([]);
  });

  it("preserves the original fixed roles for every scoped action", () => {
    const path = join(root, "src/app/admin/actions.ts");
    for (const call of calls(path, "mutation")) {
      const roles = call.arguments[0],
        permission = call.arguments[3];
      if (!ts.isArrayLiteralExpression(roles) || !permission || !ts.isStringLiteral(permission))
        continue;
      for (const role of roles.elements) {
        if (ts.isStringLiteral(role))
          expect(
            hasStaffPermission({ role: role.text }, permission.text as StaffPermission),
            `${role.text} lost ${permission.text}`,
          ).toBe(true);
      }
    }
  });

  it("checks permissions on private exports, uploads and documents", () => {
    for (const name of [
      "src/app/api/admin/finance/export/route.ts",
      "src/app/api/admin/banner-image/route.ts",
      "src/app/api/identity/doc/[id]/route.ts",
      "src/app/api/store/verify/doc/[id]/route.ts",
    ]) {
      const path = join(root, name);
      expect(
        calls(path, "getAdminCurrentUser").some(
          (call) => call.arguments.length === 2 && ts.isStringLiteral(call.arguments[1]),
        ),
        name,
      ).toBe(true);
    }
  });
});
