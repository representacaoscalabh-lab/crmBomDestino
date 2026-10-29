/** A missing API can occur on hosts that only serve the frontend. */
export async function readRecordResponse(response: Response): Promise<{ fallback: boolean; value: unknown }> {
  const text = await response.text();
  let value: unknown;
  let validJson = false;
  try {
    value = JSON.parse(text);
    validJson = true;
  } catch {
    // Empty responses and host-generated HTML are not API payloads.
  }
  const details = value && typeof value === "object" ? value as { code?: string; error?: string } : undefined;
  if (response.status === 401 || response.status === 403) {
    throw new Error(details?.error || "Sua sessão não está autorizada. Entre novamente na sua conta.");
  }
  if ([404, 405].includes(response.status) ||
      (response.status >= 500 && (typeof details?.error !== "string" || details?.code === "server-not-configured")) ||
      (response.ok && !validJson)) {
    return { fallback: true, value: undefined };
  }
  if (!response.ok) {
    throw new Error(details?.error || `Não foi possível consultar os registros (HTTP ${response.status}).`);
  }
  return { fallback: false, value };
}
