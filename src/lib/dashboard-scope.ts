import type { Customer, CustomerGroup } from "./types";

export function getExternalCustomerIds(customers: Customer[], groups: CustomerGroup[]): Set<string> {
  const byId = new Map(groups.map((group) => [group.id, group]));
  return new Set(customers.filter((customer) => customer.groupId
    && byId.get(customer.groupId)?.externalStoreSellers?.[customer.id]?.trim()).map((customer) => customer.id));
}
