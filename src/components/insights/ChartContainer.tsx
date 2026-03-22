'use client'

import { useState, useEffect, useRef, ReactElement } from 'react'
import { ResponsiveContainer } from 'recharts'

interface Props {
  children: ReactElement
  height?: string
  className?: string
}

/**
 * Wrapper around Recharts ResponsiveContainer that defers rendering
 * until the container element is mounted and has positive dimensions.
 * This prevents the "width(-1) height(-1)" console warnings.
 */
export default function ChartContainer({ children, height = '100%', className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Use ResizeObserver to detect when the container has positive dimensions
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setReady(true)
          observer.disconnect()
        }
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height }}>
      {ready && (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  )
}
