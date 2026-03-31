"use client"

import { useCallback, useEffect, useState } from "react"
import { BrandPanel, Eyebrow, StatPill } from "@/components/ui/brand"

interface TableMetric {
  name: string
  rows: number
}

interface UsageData {
  database: {
    tables: TableMetric[]
    totalRows: number
  }
  supabase: {
    plan: string
    limits: Record<string, string>
  }
}

interface Props {
  submissionCount: number
  employeeCount: number
}

export default function UsageDashboard({
  submissionCount,
  employeeCount,
}: Props) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage")
      if (!res.ok) throw new Error("failed to load usage")
      setUsage(await res.json())
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="animate-pulse text-sm text-muted">
          loading usage data...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="text-sm text-[#d35b52]">{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatPill
          accent="sky"
          label="total db rows"
          value={usage?.database.totalRows.toLocaleString() ?? "—"}
          detail="across all tables"
        />
        <StatPill
          accent="peach"
          label="submissions"
          value={submissionCount.toLocaleString()}
          detail="feedback entries"
        />
        <StatPill
          accent="sage"
          label="team size"
          value={employeeCount}
          detail="registered employees"
        />
      </div>

      {/* Supabase */}
      <BrandPanel accent="sage" tone="soft" className="brand-lines p-4 sm:p-5">
        <Eyebrow accent="sage">supabase</Eyebrow>
        <h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-ink">
          database usage
        </h3>
        <p className="mt-1 text-xs text-muted">
          plan: {usage?.supabase.plan}
        </p>

        <div className="mt-4 space-y-2">
          {usage?.database.tables.map((table) => {
            const maxRows = Math.max(
              ...usage.database.tables.map((t) => t.rows),
              1
            )
            const pct = (table.rows / maxRows) * 100

            return (
              <div key={table.name} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-xs font-medium text-muted">
                  {table.name.replace("feedback_", "")}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full rounded-full bg-brand-sage transition-all duration-500"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs font-semibold tabular-nums text-ink">
                  {table.rows.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>

        {/* Plan limits */}
        {usage?.supabase.limits && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(usage.supabase.limits).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center rounded-full border border-line bg-white/60 px-3 py-1 text-[11px] font-medium text-muted"
              >
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}: {value}
              </span>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted">
          for full supabase metrics, visit{" "}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline decoration-brand-sage decoration-2 underline-offset-4"
          >
            supabase reports ↗
          </a>
        </p>
      </BrandPanel>

      {/* Vercel */}
      <BrandPanel
        accent="yellow"
        tone="soft"
        className="brand-lines p-4 sm:p-5"
      >
        <Eyebrow accent="yellow">vercel</Eyebrow>
        <h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-ink">
          hosting &amp; compute
        </h3>
        <p className="mt-1 text-xs text-muted">
          build3.online · pro plan
        </p>

        <div className="mt-4 space-y-3">
          <LimitRow
            label="serverless function executions"
            used={null}
            limit={1000000}
            unit="/mo"
            note="estimated from page views + API calls"
          />
          <LimitRow
            label="bandwidth"
            used={null}
            limit={1000}
            unit=" GB/mo"
          />
          <LimitRow
            label="build executions"
            used={null}
            limit={6000}
            unit=" min/mo"
          />
        </div>

        <p className="mt-4 text-[11px] text-muted">
          vercel does not expose usage via API without a token.{" "}
          <a
            href="https://vercel.com/build3-foundations-projects/~/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline decoration-brand-yellow decoration-2 underline-offset-4"
          >
            view vercel usage dashboard ↗
          </a>
        </p>
      </BrandPanel>
    </div>
  )
}

function LimitRow({
  label,
  used,
  limit,
  unit,
  note,
}: {
  label: string
  used: number | null
  limit: number
  unit: string
  note?: string
}) {
  const pct = used !== null ? Math.min((used / limit) * 100, 100) : 0
  const color =
    pct > 80 ? "#d35b52" : pct > 50 ? "#f5bb9f" : "#79c0a6"

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-ink">
          {used !== null ? (
            <>
              {used.toLocaleString()} / {limit.toLocaleString()}
              {unit}
            </>
          ) : (
            <>
              — / {limit.toLocaleString()}
              {unit}
            </>
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(pct, used !== null ? 2 : 0)}%`,
            backgroundColor: used !== null ? color : "transparent",
          }}
        />
      </div>
      {note && (
        <p className="mt-0.5 text-[10px] text-muted/70">{note}</p>
      )}
    </div>
  )
}
