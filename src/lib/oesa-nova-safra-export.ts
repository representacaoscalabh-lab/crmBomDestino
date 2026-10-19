import { createMartMinasWorkbook } from "./mart-minas-export";
import type { MartMinasAnalytics } from "./mart-minas-analytics";

export async function downloadOesaNovaSafraReport(report: MartMinasAnalytics, groupName: string, scope: string, status: string) {
  const buffer = await createMartMinasWorkbook(report, groupName, scope, status).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `oesa-nova-safra-${report.currentPeriod.start}-${report.currentPeriod.end}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
