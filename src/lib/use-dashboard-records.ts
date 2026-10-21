"use client";

import { useMemo } from "react";
import { usePeriodRecords } from "@/lib/use-period-records";
import { dailyToDashboardRecord, type DailyRecord } from "@/lib/daily-records";
import type { Bonification, Order } from "@/lib/types";

export function useDashboardRecords<T extends Order | Bonification>(resource: "orders" | "bonifications", start: string, end: string) {
  // Enable only after backfill + function deployment + reconciliation documented in the rollout guide.
  const summaries = process.env.NEXT_PUBLIC_FIREBASE_DAILY_SUMMARIES === "true";
  const raw = usePeriodRecords<T>(resource, start, end, !summaries);
  const daily = usePeriodRecords<DailyRecord>(resource === "orders" ? "daily_orders" : "daily_bonifications", start, end, summaries);
  const rows = useMemo(() => summaries ? daily.rows.map(row => dailyToDashboardRecord(row) as T) : raw.rows, [summaries, daily.rows, raw.rows]);
  return summaries ? { ...daily, rows } : raw;
}
