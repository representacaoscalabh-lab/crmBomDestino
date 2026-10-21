"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

type SortValue = string | number | undefined;
export function useTableSort<T>(rows: T[]) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc"; value: (row: T) => SortValue } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const left = sort.value(a) ?? "";
      const right = sort.value(b) ?? "";
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "pt-BR", { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);
  function heading(key: string, label: string, value: (row: T) => SortValue) {
    const active = sort?.key === key;
    return <th key={key} aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button className="sort-heading" onClick={() => setSort({ key, value, direction: active && sort.direction === "asc" ? "desc" : "asc" })}>{label}{active ? sort.direction === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : <ChevronsUpDown size={14} />}</button></th>;
  }
  return { sorted, heading };
}
