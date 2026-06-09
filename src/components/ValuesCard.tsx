import { BUILD3_VALUES } from "@/lib/questions"
import { BrandPanel, PillarMark } from "@/components/ui/brand"

export default function ValuesCard() {
  return (
    <BrandPanel accent="peach" tone="washed" className="brand-lines mb-5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <PillarMark accent="peach" />
        <p className="text-sm font-semibold text-ink">what we build around</p>
      </div>
      <ol className="space-y-3 text-sm leading-6 text-muted">
        {BUILD3_VALUES.map((value, index) => {
          const firstPeriod = value.indexOf(". ")
          const title = firstPeriod === -1 ? value.replace(/\.$/, "") : value.slice(0, firstPeriod)
          const description = firstPeriod === -1 ? "" : value.slice(firstPeriod + 2).replace(/\.$/, "")
          return (
            <li key={index} className="flex gap-3">
              <span className="mt-0.5 text-xs font-semibold tracking-[0.08em] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{title}</div>
                {description && (
                  <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </BrandPanel>
  )
}
