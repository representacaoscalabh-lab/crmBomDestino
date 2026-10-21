import catalog from "./api-collections.json";

export const apiConfig = {
  name: "API CRM Bom Destino",
  version: "1.0.0",
  basePath: "/api/v1",
  defaultLimit: 25,
  maxLimit: 100,
  authentication: "Firebase ID token (Bearer)",
  collections: catalog,
} as const;

export function getApiCollection(name: string) {
  return apiConfig.collections.find(collection => collection.name === name);
}
