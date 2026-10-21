"use client";

import { useSharedReportSettings } from "@/lib/shared-report-settings";

export function useMartMinasSettings() {
  return useSharedReportSettings("mart_minas");
}
