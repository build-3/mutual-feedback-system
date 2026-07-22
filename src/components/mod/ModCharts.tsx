"use client"

import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts"
import ChartContainer from "@/components/insights/ChartContainer"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"
import { BRAND_COLORS } from "@/lib/brand"
import { severityMeta, trustColor } from "./types"

export interface ChartsData {
  deptRows: { department: string; count: number; avgSeverity: number }[]
  severityDist: { label: string; count: number; value: number }[]
  trustBuckets: { label: string; count: number; floor: number }[]
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <BrandPanel accent="sky" tone="plain" className="p-4 sm:p-5">
      <Eyebrow accent="sky">{title}</Eyebrow>
      <div className="mt-3">{children}</div>
    </BrandPanel>
  )
}

const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${BRAND_COLORS.line}`,
  fontSize: 12,
}

export default function ModCharts({ data }: { data: ChartsData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="reviews by department">
        <div style={{ height: Math.max(200, data.deptRows.length * 34) }}>
          <ChartContainer>
            <BarChart data={data.deptRows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: BRAND_COLORS.muted }} />
              <YAxis
                type="category"
                dataKey="department"
                width={132}
                tick={{ fontSize: 11, fill: BRAND_COLORS.ink }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, _name, item) => {
                  const p = (item as { payload?: { avgSeverity?: number } })?.payload
                  return [`${value} reviews · sev ${(p?.avgSeverity ?? 0).toFixed(1)}`, "reviews"]
                }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {data.deptRows.map((row) => (
                  <Cell key={row.department} fill={severityMeta(row.avgSeverity).color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </Panel>

      <Panel title="severity distribution">
        <div style={{ height: 240 }}>
          <ChartContainer>
            <BarChart data={data.severityDist} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: BRAND_COLORS.ink }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: BRAND_COLORS.muted }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}`, "reviews"]} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.severityDist.map((s) => (
                  <Cell key={s.label} fill={severityMeta(s.value).color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </Panel>

      <Panel title="trust battery spread">
        <div style={{ height: 240 }}>
          <ChartContainer>
            <BarChart data={data.trustBuckets} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: BRAND_COLORS.ink }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: BRAND_COLORS.muted }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}`, "people"]} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.trustBuckets.map((b) => (
                  <Cell key={b.label} fill={trustColor(b.floor)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </Panel>
    </div>
  )
}
