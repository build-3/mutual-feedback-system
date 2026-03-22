"use client"

import clsx from "clsx"
import type { CSSProperties, ReactNode } from "react"
import {
  Accent,
  BRAND_COLORS,
  getAccentTheme,
} from "@/lib/brand"

type PanelTone = "plain" | "soft" | "washed" | "solid" | "ink"
type ButtonVariant = "solid" | "outline" | "ghost" | "ink"
type ButtonSize = "sm" | "md" | "lg"
type BadgeTone = "soft" | "solid" | "outline"

function lowerLabel(text: string) {
  return text.toLowerCase()
}

function getPanelStyle(accent: Accent, tone: PanelTone): CSSProperties {
  const theme = getAccentTheme(accent)

  if (tone === "solid") {
    return {
      backgroundColor: theme.solid,
      borderColor: theme.solid,
      color: theme.contrast,
    }
  }

  if (tone === "soft") {
    return {
      backgroundColor: theme.soft,
      borderColor: theme.border,
    }
  }

  if (tone === "washed") {
    return {
      backgroundColor: theme.washed,
      borderColor: theme.border,
    }
  }

  if (tone === "ink") {
    return {
      backgroundColor: BRAND_COLORS.ink,
      borderColor: getAccentTheme("ink").border,
      color: BRAND_COLORS.white,
    }
  }

  return {
    backgroundColor: BRAND_COLORS.surface,
    borderColor: BRAND_COLORS.line,
  }
}

export function buttonClasses({
  accent = "peach",
  variant = "solid",
  size = "md",
  fullWidth = false,
}: {
  accent?: Accent
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}) {
  const theme = getAccentTheme(accent)
  const base = clsx(
    "inline-flex items-center justify-center gap-2 rounded-full border font-semibold tracking-[-0.02em] transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-canvas)]",
    "disabled:cursor-not-allowed disabled:opacity-45",
    fullWidth && "w-full"
  )

  const sizeClasses =
    size === "sm"
      ? "px-3.5 py-2 text-sm"
      : size === "lg"
      ? "px-6 py-3.5 text-[15px]"
      : "px-5 py-3 text-sm"

  const variantClasses =
    variant === "solid"
      ? "shadow-[var(--shadow-soft)] hover:-translate-y-0.5"
      : variant === "ink"
      ? "hover:-translate-y-0.5"
      : "hover:-translate-y-0.5"

  const style: CSSProperties =
    variant === "solid"
      ? {
          backgroundColor: theme.solid,
          borderColor: theme.solid,
          color: theme.contrast,
        }
      : variant === "ink"
      ? {
          backgroundColor: BRAND_COLORS.ink,
          borderColor: BRAND_COLORS.ink,
          color: BRAND_COLORS.white,
        }
      : variant === "outline"
      ? {
          backgroundColor: "rgba(255,255,255,0.78)",
          borderColor: theme.border,
          color: BRAND_COLORS.ink,
        }
      : {
          backgroundColor: "rgba(255,255,255,0.64)",
          borderColor: "rgba(29, 29, 27, 0.08)",
          color: BRAND_COLORS.ink,
        }

  return { className: clsx(base, sizeClasses, variantClasses), style }
}

export function fieldClasses({
  size = "md",
  hasError = false,
}: {
  size?: ButtonSize
  hasError?: boolean
} = {}) {
  return clsx(
    "w-full rounded-[24px] border bg-white/88 text-[15px] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-sm transition-all duration-200",
    "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-canvas)]",
    size === "sm" ? "px-3.5 py-2.5" : size === "lg" ? "px-5 py-4" : "px-4 py-3",
    hasError ? "border-[#d35b52]" : "border-line"
  )
}

export function badgeClasses({
  accent = "peach",
  tone = "soft",
}: {
  accent?: Accent
  tone?: BadgeTone
}) {
  const theme = getAccentTheme(accent)
  const style: CSSProperties =
    tone === "solid"
      ? {
          backgroundColor: theme.solid,
          borderColor: theme.solid,
          color: theme.contrast,
        }
      : tone === "outline"
      ? {
          backgroundColor: "transparent",
          borderColor: theme.border,
          color: BRAND_COLORS.ink,
        }
      : {
          backgroundColor: theme.soft,
          borderColor: theme.border,
          color: BRAND_COLORS.ink,
        }

  return {
    className:
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em]",
    style,
  }
}

export function PillarMark({
  accent = "peach",
  className,
}: {
  accent?: Accent
  className?: string
}) {
  const theme = getAccentTheme(accent)

  return (
    <span className={clsx("inline-flex items-end gap-1", className)} aria-hidden>
      <span className="w-1 rounded-full" style={{ height: 14, backgroundColor: theme.solid }} />
      <span className="w-1 rounded-full" style={{ height: 24, backgroundColor: theme.solid }} />
      <span className="w-1 rounded-full" style={{ height: 18, backgroundColor: theme.solid }} />
    </span>
  )
}

export function BrandPanel({
  accent = "peach",
  tone = "plain",
  className,
  children,
  style,
}: {
  accent?: Accent
  tone?: PanelTone
  className?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      className={clsx(
        "relative rounded-[30px] border shadow-[var(--shadow-soft)]",
        tone === "ink" ? "shadow-none" : "",
        className
      )}
      style={{ ...getPanelStyle(accent, tone), ...style }}
    >
      {tone !== "ink" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px"
          style={{ backgroundColor: getAccentTheme(accent).border }}
        />
      )}
      {children}
    </div>
  )
}

export function Eyebrow({
  accent = "peach",
  children,
  className,
}: {
  accent?: Accent
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx("flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted", className)}>
      <PillarMark accent={accent} />
      <span>{typeof children === "string" ? lowerLabel(children) : children}</span>
    </div>
  )
}

export function SectionHeading({
  accent = "peach",
  eyebrow,
  title,
  description,
  action,
  align = "left",
}: {
  accent?: Accent
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  align?: "left" | "center"
}) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "items-center text-center sm:flex-col sm:items-center"
      )}
    >
      <div className={clsx("space-y-2", align === "center" && "max-w-2xl")}>
        {eyebrow && (
          <Eyebrow accent={accent}>{eyebrow}</Eyebrow>
        )}
        <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[0.96] tracking-[-0.05em] text-ink">
          {title}
        </h1>
        {description && (
          <div className="max-w-2xl space-y-2 text-[15px] leading-7 text-muted">
            {description.split("\n").map((line, i) => {
              if (!line.trim()) return null
              const parts = line.split(/(https?:\/\/[^\s]+)/)
              return (
                <p key={i}>
                  {parts.map((part, j) =>
                    part.startsWith("http") ? (
                      <a
                        key={j}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-ink underline decoration-brand/50 decoration-2 underline-offset-4 hover:decoration-brand"
                      >
                        {part}
                      </a>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              )
            })}
          </div>
        )}
      </div>
      {action}
    </div>
  )
}

export function StatPill({
  accent = "peach",
  label,
  value,
  detail,
}: {
  accent?: Accent
  label: string
  value: ReactNode
  detail?: ReactNode
}) {
  const theme = getAccentTheme(accent)

  return (
    <div
      className="rounded-[22px] border px-4 py-3"
      style={{ backgroundColor: theme.soft, borderColor: theme.border }}
    >
      <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
        {lowerLabel(label)}
      </div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted">{detail}</div>}
    </div>
  )
}

export function NoticeCard({
  accent = "peach",
  title,
  children,
  action,
}: {
  accent?: Accent
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <BrandPanel accent={accent} tone="soft" className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
        <div className="flex items-center gap-2">
            <PillarMark accent={accent} />
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
          </div>
          <div className="text-sm leading-6 text-muted">{children}</div>
        </div>
        {action}
      </div>
    </BrandPanel>
  )
}

export function EmptyState({
  accent = "peach",
  title,
  description,
  action,
}: {
  accent?: Accent
  title: string
  description: ReactNode
  action?: ReactNode
}) {
  const theme = getAccentTheme(accent)

  return (
    <BrandPanel accent={accent} tone="washed" className="p-8 text-center sm:p-10">
      <div
        className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border"
        style={{ backgroundColor: theme.soft, borderColor: theme.border }}
      >
        <PillarMark accent={accent} className="scale-110" />
      </div>
      <h3 className="text-xl font-semibold tracking-[-0.03em] text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </BrandPanel>
  )
}

export function Modal({
  open,
  title,
  description,
  accent = "sage",
  children,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  accent?: Accent
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="close"
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <BrandPanel
        accent={accent}
        tone="plain"
        className="relative z-10 w-full max-w-md p-6 sm:p-7"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <PillarMark accent={accent} />
            <h3 className="text-xl font-semibold tracking-[-0.04em] text-ink">{title}</h3>
          </div>
          {description && <p className="text-sm leading-7 text-muted">{description}</p>}
          <div className="pt-2">{children}</div>
        </div>
      </BrandPanel>
    </div>
  )
}
