"use client";

import { useSharedReportSettings } from "@/lib/shared-report-settings";

export function useOesaNovaSafraSettings() {
  return useSharedReportSettings("oesa_nova_safra");
}
