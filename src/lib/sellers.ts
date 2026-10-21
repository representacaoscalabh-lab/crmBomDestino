/** Compatibility for the fixed responsible parties; no seller registration. */
export function useSellers() {
  return { sellers: [{ id: "sul-de-minas", name: "Sul de Minas" }], loading: false, error: "" };
}
