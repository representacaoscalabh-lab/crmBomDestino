"use client";

import { NetworkReportsPage } from "@/components/network-reports-page";
import { useOesaNovaSafraSettings } from "@/lib/oesa-nova-safra-settings";

export default function OesaNovaSafraReportPage() {
  const settings = useOesaNovaSafraSettings();
  return <NetworkReportsPage settings={settings} defaultTitle="OESA - Nova Safra" />;
}
