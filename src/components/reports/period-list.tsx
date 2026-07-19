"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPeriod } from "@/lib/payroll/period";
import { formatPHP } from "@/lib/money";
import type { PayrollStatus } from "@/lib/types";
import { CalendarDays, ChevronRight, FileText } from "lucide-react";

export type PeriodSummary = {
  id: string;
  period_start: string;
  period_end: string;
  status: PayrollStatus;
  note: string | null;
  employeeCount: number;
  totalNet: number;
};

type SortKey = "date_desc" | "date_asc" | "status" | "total_desc";

const SORT_LABELS: Record<SortKey, string> = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  status: "Status (draft first)",
  total_desc: "Total net pay (highest)",
};

const SORTERS: Record<SortKey, (a: PeriodSummary, b: PeriodSummary) => number> = {
  date_desc: (a, b) => b.period_start.localeCompare(a.period_start),
  date_asc: (a, b) => a.period_start.localeCompare(b.period_start),
  status: (a, b) => {
    if (a.status !== b.status) return a.status === "draft" ? -1 : 1;
    return b.period_start.localeCompare(a.period_start);
  },
  total_desc: (a, b) => b.totalNet - a.totalNet,
};

export function PeriodReportList({ periods }: { periods: PeriodSummary[] }) {
  const [sort, setSort] = useState<SortKey>("date_desc");

  const sorted = useMemo(() => [...periods].sort(SORTERS[sort]), [periods, sort]);

  if (periods.length === 0) {
    return (
      <Card className="animate-rise">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-7 w-7" />
          </span>
          <p className="text-sm text-muted-foreground">No payroll runs yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Sort by</span>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[210px]" aria-label="Sort payroll periods">
            <SelectValue>{(v: SortKey) => SORT_LABELS[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {sorted.map((p) => (
          <Link key={p.id} href={`/reports/period/${p.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{formatPeriod(p.period_start, p.period_end)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.employeeCount} {p.employeeCount === 1 ? "employee" : "employees"} ·{" "}
                    {formatPHP(p.totalNet)}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <Badge variant={p.status === "finalized" ? "default" : "secondary"}>
                  {p.status === "finalized" ? "Finalized" : "Draft"}
                </Badge>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
