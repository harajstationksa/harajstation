import { describe, expect, it } from "vitest";
import {
  canUseStaffGate,
  hasStaffPermission,
  parseStaffPermissions,
  selectedStaffPermissions,
  staffHomePath,
} from "@/lib/staff-permissions";

describe("staff access policy", () => {
  it("preserves legacy roles while limiting custom employees to explicit grants", () => {
    expect(hasStaffPermission({ role: "MODERATOR" }, "listings.manage")).toBe(true);
    expect(hasStaffPermission({ role: "SUPPORT" }, "listings.manage")).toBe(false);
    expect(hasStaffPermission({ role: "ACCOUNTANT" }, "finance.export")).toBe(true);
    const viewer = { role: "STAFF", staffPermissions: '["listings.view"]' };
    expect(canUseStaffGate(viewer, ["ADMIN", "MODERATOR"], "listings.view")).toBe(true);
    expect(canUseStaffGate(viewer, ["ADMIN", "MODERATOR"], "listings.manage")).toBe(false);
    expect(canUseStaffGate(viewer, ["ADMIN", "MODERATOR"])).toBe(false);
    expect(staffHomePath(viewer)).toBe("/admin/listings");
    expect(staffHomePath({ role: "STAFF", staffPermissions: '["search.view"]' })).toBe(
      "/admin/account",
    );
  });

  it("fails closed on malformed and unknown stored permissions", () => {
    expect(parseStaffPermissions("invalid")).toEqual([]);
    expect(parseStaffPermissions('["listings.view","secret.root"]')).toEqual(["listings.view"]);
    expect(hasStaffPermission({ role: "STAFF", staffPermissions: "invalid" }, "users.view")).toBe(
      false,
    );
    expect(hasStaffPermission({ role: "ADMIN", staffPermissions: "invalid" }, "users.view")).toBe(
      true,
    );
  });

  it("rejects unknown form grants and adds the read prerequisite to write grants", () => {
    expect(selectedStaffPermissions(["listings.manage"])).toEqual([
      "listings.view",
      "listings.manage",
    ]);
    expect(selectedStaffPermissions(["users.points"])).toEqual(["users.view", "users.points"]);
    expect(selectedStaffPermissions(["staff.manage"])).toBeNull();
    expect(selectedStaffPermissions([new File(["x"], "grant.txt")])).toBeNull();
  });
});
