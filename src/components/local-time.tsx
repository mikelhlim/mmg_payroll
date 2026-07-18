"use client";

import { useEffect, useState } from "react";

/**
 * Renders a UTC/ISO timestamp in the VIEWER's local timezone and locale — so
 * the date/time reflects wherever the app is being accessed. Renders the raw
 * ISO on the server / first paint, then swaps to local formatting after mount
 * (suppressHydrationWarning avoids a mismatch warning).
 */
export function LocalTime({
  iso,
  dateOnly = false,
  className,
}: {
  iso: string | null | undefined;
  dateOnly?: boolean;
  className?: string;
}) {
  const [text, setText] = useState<string>(iso ?? "—");

  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      setText(iso);
      return;
    }
    setText(
      d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
      })
    );
  }, [iso, dateOnly]);

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
