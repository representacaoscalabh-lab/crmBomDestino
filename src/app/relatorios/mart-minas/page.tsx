"use client";

import { NetworkReportsPage } from "@/components/network-reports-page";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";

export default function MartMinasReportPage() {
  const settings = useMartMinasSettings();
  return <NetworkReportsPage settings={settings} defaultTitle="Mart Minas" />;
}
