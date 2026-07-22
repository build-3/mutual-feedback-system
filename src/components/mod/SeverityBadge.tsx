import { severityMeta } from "./types"
import { withAlphaHex } from "./color"

export default function SeverityBadge({ severity }: { severity: number | null | undefined }) {
  const { label, color } = severityMeta(severity)
  const value = severity == null ? "–" : `${Number.isInteger(severity) ? severity : severity.toFixed(1)}/5`

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em]"
      style={{ backgroundColor: withAlphaHex(color, 0.18), borderColor: withAlphaHex(color, 0.5), color: "#1d1d1b" }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {value} · {label}
    </span>
  )
}
