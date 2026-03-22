import { BUILD3_VALUES } from "@/lib/questions"
import { BrandPanel, PillarMark } from "@/components/ui/brand"

export default function ValuesCard() {
  return (
    <BrandPanel accent="peach" tone="washed" className="brand-lines mb-5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <PillarMark accent="peach" />
        <p className="text-sm font-semibold text-ink">what we build around</p>
      </div>
      <ol className="space-y-2 text-sm leading-6 text-muted">
        {BUILD3_VALUES.map((value, index) => (
          <li key={index} className="flex gap-3">
            <span className="mt-0.5 text-xs font-semibold tracking-[0.08em] text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{value}</span>
          </li>
        ))}
      </ol>
    </BrandPanel>
  )
}
