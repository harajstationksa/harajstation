import { STAFF_PERMISSION_GROUPS } from "@/lib/staff-permissions";

export function StaffPermissionGrid({
  selected = [],
  disabled = false,
}: {
  selected?: readonly string[];
  disabled?: boolean;
}) {
  const current = new Set(selected);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 disabled:opacity-50">
      <legend className="text-sm font-bold mb-3">صلاحيات الموظف</legend>
      <p className="text-xs text-neutral-500 mb-3">
        اختر ما يحتاجه الموظف فقط. صلاحية التنفيذ تتضمن عرض القسم تلقائيًا.
      </p>
      {STAFF_PERMISSION_GROUPS.map((group) => (
        <section
          key={group.label}
          className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3"
        >
          <h3 className="text-sm font-semibold mb-2">{group.label}</h3>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {group.items.map((item) => (
              <label
                key={item.key}
                className="admin-permission-item flex gap-2.5 rounded-lg bg-white border border-neutral-100 p-2.5 cursor-pointer hover:border-primary-200"
              >
                <input
                  name="permissions"
                  type="checkbox"
                  value={item.key}
                  defaultChecked={current.has(item.key)}
                  className="mt-0.5 size-4 accent-primary-600 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-neutral-500 leading-5">
                    {item.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </fieldset>
  );
}
