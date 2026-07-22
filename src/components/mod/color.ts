// Small hex → rgba helper (brand.ts keeps its own version private).
export function withAlphaHex(hex: string, alpha: number): string {
  const value = hex.replace("#", "")
  const full = value.length === 3 ? value.split("").map((p) => `${p}${p}`).join("") : value
  const n = Number.parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
