/** Lightweight date formatting — replaces date-fns to save ~50KB from bundles */

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

export function formatDate(date: Date, pattern: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  const fullMonths = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]
  const d = date.getDate()
  const m = date.getMonth()
  const y = date.getFullYear()
  const h = date.getHours()
  const min = date.getMinutes()

  return pattern
    .replace("MMMM", fullMonths[m])
    .replace("MMM", months[m])
    .replace("MM", String(m + 1).padStart(2, "0"))
    .replace("dd", String(d).padStart(2, "0"))
    .replace("d", String(d))
    .replace("yyyy", String(y))
    .replace("HH", String(h).padStart(2, "0"))
    .replace("mm", String(min).padStart(2, "0"))
    .replace("h", String(h % 12 || 12))
}
