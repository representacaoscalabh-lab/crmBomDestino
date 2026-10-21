import type { CustomerGroup } from "./types";

/** Existing external assignments now belong to the single Sul de Minas portfolio. */
export function normalizeCustomerGroup(group: CustomerGroup): CustomerGroup {
  return { ...group, externalStoreSellers: Object.fromEntries(Object.entries(group.externalStoreSellers ?? {}).filter(([, name]) => !!name.trim()).map(([id]) => [id, "Sul de Minas"])) };
}
