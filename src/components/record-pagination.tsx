"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { useRecordPage } from "@/lib/use-record-page";
import "./record-pagination.css";

export function RecordPagination({ page }: { page: ReturnType<typeof useRecordPage> }) {
  return <nav className="record-pagination" aria-label="Paginação dos registros">
    <label>Por página <select aria-label="Registros por página" value={page.pageSize} disabled={page.loading} onChange={event => page.setPageSize(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option></select></label>
    <span>Página {page.pageNumber}{page.loading ? " · Carregando…" : ""}</span>
    <div><button type="button" disabled={!page.hasPrevious || page.loading} onClick={page.previous}><ChevronLeft size={15} /> Anterior</button><button type="button" disabled={!page.hasNext || page.loading} onClick={page.next}>Próxima <ChevronRight size={15} /></button></div>
  </nav>;
}
