"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CsvRow {
  name: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  total_amount: number;
}

// Escape a single field for RFC-4180 CSV: wrap in quotes if it contains a
// comma, quote, or newline, and double any internal quotes.
function escapeCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ExportCohortCsvButton({
  filename,
  rows,
}: {
  filename: string;
  rows: CsvRow[];
}) {
  function handleDownload() {
    const header = ["Name", "Phone", "Email", "City", "Lead source", "Total amount"];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          escapeCell(r.name),
          escapeCell(r.phone),
          escapeCell(r.email),
          escapeCell(r.city),
          escapeCell(r.source),
          escapeCell(r.total_amount),
        ].join(","),
      ),
    ];
    // BOM so Excel opens UTF-8 without mojibake.
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={rows.length === 0}
      title={
        rows.length === 0
          ? "No leads to export yet."
          : "Download the clubbed lead list as CSV"
      }
    >
      <Download size={14} className="inline mr-1 -mt-0.5" />
      Export CSV
    </Button>
  );
}
