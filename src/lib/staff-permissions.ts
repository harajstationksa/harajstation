/** The same allowlist drives the staff editor, navigation and server checks. */
export const STAFF_PERMISSION_GROUPS = [
  {
    label: "المتابعة والبحث",
    items: [
      { key: "dashboard.view", label: "لوحة المعلومات", description: "ملخص مؤشرات الموقع" },
      { key: "search.view", label: "بحث الإدارة", description: "البحث في الأقسام المسموح بعرضها" },
      {
        key: "operations.view",
        label: "صحة التشغيل",
        description: "حالة الخدمات والنسخ الاحتياطية",
      },
      { key: "audit.view", label: "سجل الإدارة", description: "قراءة سجل قرارات الموظفين" },
    ],
  },
  {
    label: "المستخدمون والإعلانات",
    items: [
      { key: "users.view", label: "عرض المستخدمين", description: "الملفات وبيانات الحساب" },
      { key: "users.manage", label: "إدارة المستخدمين", description: "الحظر وإلغاء الحظر" },
      { key: "users.credibility", label: "المصداقية", description: "تعديل درجة المصداقية" },
      { key: "users.points", label: "نقاط المستخدمين", description: "إضافة النقاط أو خصمها" },
      { key: "users.pro", label: "اشتراك برو", description: "منح أو سحب الاشتراك" },
      { key: "users.notify", label: "إشعار المستخدم", description: "إرسال رسالة إدارية فردية" },
      {
        key: "listings.view",
        label: "عرض الإعلانات",
        description: "الاطلاع على الإعلانات ونتائج الفحص",
      },
      {
        key: "listings.manage",
        label: "إدارة الإعلانات",
        description: "الموافقة والرفض والإزالة والتمييز",
      },
      { key: "bids.view", label: "سجل المزايدات", description: "قراءة المزايدات" },
    ],
  },
  {
    label: "الثقة وخدمة العملاء",
    items: [
      { key: "reports.view", label: "عرض البلاغات", description: "قراءة البلاغات" },
      {
        key: "reports.manage",
        label: "معالجة البلاغات",
        description: "إغلاق البلاغات وإخفاء التعليقات",
      },
      { key: "disputes.view", label: "عرض النزاعات", description: "قراءة تفاصيل النزاعات" },
      { key: "disputes.resolve", label: "حسم النزاعات", description: "إصدار القرار النهائي" },
      { key: "identity.view", label: "عرض طلبات الهوية", description: "قراءة الوثائق الخاصة" },
      { key: "identity.review", label: "مراجعة الهوية", description: "اعتماد أو رفض التوثيق" },
      { key: "stores.view", label: "عرض توثيق المتاجر", description: "قراءة طلبات المتاجر" },
      { key: "stores.review", label: "مراجعة المتاجر", description: "اعتماد أو رفض التوثيق" },
      { key: "transactions.view", label: "معاملات البيع", description: "قراءة المعاملات" },
    ],
  },
  {
    label: "المالية والتسويق",
    items: [
      { key: "finance.view", label: "التقارير المالية", description: "قراءة المدفوعات والأرصدة" },
      { key: "finance.export", label: "تصدير المالية", description: "تنزيل ملفات CSV" },
      { key: "campaigns.view", label: "الحملات", description: "قراءة الحملات الإعلانية" },
      { key: "banners.manage", label: "البانرات", description: "إضافة وتعديل البانرات" },
      { key: "promos.manage", label: "الأكواد والإحالة", description: "إدارة العروض والإحالة" },
      { key: "plans.manage", label: "الباقات", description: "تغيير الأسعار والحدود" },
      { key: "points.manage", label: "باقات النقاط", description: "تغيير نقاط الشراء والأسعار" },
      {
        key: "moderation.manage",
        label: "سياسات الإشراف",
        description: "المحظورات والإشعارات العامة",
      },
    ],
  },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSION_GROUPS)[number]["items"][number]["key"];
export const STAFF_PERMISSIONS = STAFF_PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key),
);
export const STAFF_NAV_ACCESS: Record<string, StaffPermission> = {
  "/admin": "dashboard.view",
  "/admin/search": "search.view",
  "/admin/users": "users.view",
  "/admin/listings": "listings.view",
  "/admin/bids": "bids.view",
  "/admin/campaigns": "campaigns.view",
  "/admin/promos": "promos.manage",
  "/admin/banners": "banners.manage",
  "/admin/disputes": "disputes.view",
  "/admin/identity": "identity.view",
  "/admin/stores": "stores.view",
  "/admin/reports": "reports.view",
  "/admin/moderation": "moderation.manage",
  "/admin/finance": "finance.view",
  "/admin/transactions": "transactions.view",
  "/admin/audit": "audit.view",
  "/admin/plans": "plans.manage",
  "/admin/points": "points.manage",
  "/admin/operations": "operations.view",
};
const known = new Set<string>(STAFF_PERMISSIONS);
const parent: Partial<Record<StaffPermission, StaffPermission>> = {
  "users.manage": "users.view",
  "users.credibility": "users.view",
  "users.points": "users.view",
  "users.pro": "users.view",
  "users.notify": "users.view",
  "listings.manage": "listings.view",
  "reports.manage": "reports.view",
  "disputes.resolve": "disputes.view",
  "identity.review": "identity.view",
  "stores.review": "stores.view",
  "finance.export": "finance.view",
};

const LEGACY_GRANTS: Record<string, readonly StaffPermission[]> = {
  MODERATOR: [
    "dashboard.view",
    "search.view",
    "users.view",
    "users.manage",
    "users.credibility",
    "users.notify",
    "listings.view",
    "listings.manage",
    "bids.view",
    "campaigns.view",
    "reports.view",
    "reports.manage",
    "identity.view",
    "identity.review",
    "stores.view",
    "stores.review",
  ],
  SUPPORT: [
    "dashboard.view",
    "search.view",
    "users.view",
    "users.credibility",
    "users.points",
    "users.notify",
    "listings.view",
    "reports.view",
    "reports.manage",
    "disputes.view",
    "disputes.resolve",
    "transactions.view",
  ],
  ACCOUNTANT: ["finance.view", "finance.export"],
};

export function parseStaffPermissions(raw: string): StaffPermission[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > STAFF_PERMISSIONS.length) return [];
    return [
      ...new Set(
        data.filter((key): key is StaffPermission => typeof key === "string" && known.has(key)),
      ),
    ];
  } catch {
    return [];
  }
}

export function selectedStaffPermissions(values: FormDataEntryValue[]): StaffPermission[] | null {
  if (values.length > STAFF_PERMISSIONS.length) return null;
  const selected = new Set<StaffPermission>();
  for (const value of values) {
    if (typeof value !== "string" || !known.has(value)) return null;
    selected.add(value as StaffPermission);
  }
  for (const key of selected) {
    const required = parent[key];
    if (required) selected.add(required);
  }
  return STAFF_PERMISSIONS.filter((key) => selected.has(key));
}

export function hasStaffPermission(
  user: { role: string; staffPermissions?: string },
  permission: StaffPermission,
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "STAFF")
    return parseStaffPermissions(user.staffPermissions ?? "[]").includes(permission);
  return LEGACY_GRANTS[user.role]?.includes(permission) ?? false;
}

export function canUseStaffGate(
  user: { role: string; staffPermissions?: string },
  roles: readonly string[],
  permission?: StaffPermission,
): boolean {
  if (user.role === "STAFF")
    return permission ? hasStaffPermission(user, permission) : roles.includes("STAFF");
  return roles.includes(user.role) && (!permission || hasStaffPermission(user, permission));
}

export function staffHomePath(user: { role: string; staffPermissions?: string }): string {
  if (user.role === "ACCOUNTANT") return "/admin/finance";
  for (const [path, permission] of Object.entries(STAFF_NAV_ACCESS)) {
    if (
      path === "/admin/search" &&
      !hasStaffPermission(user, "users.view") &&
      !hasStaffPermission(user, "listings.view")
    )
      continue;
    if (hasStaffPermission(user, permission)) return path;
  }
  return "/admin/account";
}
