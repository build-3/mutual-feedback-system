import { BrandPanel } from "@/components/ui/brand"
import { severityMeta } from "./types"
import { withAlphaHex } from "./color"

export interface DeptSummary {
  department: string
  count: number
  avgSeverity: number
  criticalCount: number
}

export default function SummaryBoard({ rows }: { rows: DeptSummary[] }) {
  return (
    <BrandPanel accent="peach" tone="plain" className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-line/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted sm:px-6">
        <span>department</span>
        <span className="text-right">reviews</span>
        <span className="text-right">severity</span>
      </div>
      {rows.map((row) => {
        const meta = severityMeta(row.avgSeverity)
        return (
          <div
            key={row.department}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-line/40 px-4 py-3 last:border-b-0 sm:px-6"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{row.department}</div>
              {row.criticalCount > 0 && (
                <div className="text-[11px] text-muted">{row.criticalCount} critical</div>
              )}
            </div>
            <div className="text-right text-sm font-semibold text-ink tabular-nums">{row.count}</div>
            <div className="flex justify-end">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: withAlphaHex(meta.color, 0.18),
                  borderColor: withAlphaHex(meta.color, 0.5),
                  color: "#1d1d1b",
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                {row.avgSeverity.toFixed(1)}/5 · {meta.label}
              </span>
            </div>
          </div>
        )
      })}
    </BrandPanel>
  )
}
