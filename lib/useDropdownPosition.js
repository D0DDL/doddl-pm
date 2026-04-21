import { useEffect, useState } from 'react'

// Measures the anchor element and returns an absolute viewport position (for
// `position: fixed`) that opens the dropdown downward when there's room, or
// upward when within `minSpaceBelow` px of the bottom edge. Also clamps the
// horizontal position so the panel doesn't spill off the right side.
//
// Returns { top, left, width?, placement: 'down' | 'up' } once measured, or
// null while the dropdown is closed / before first measurement.
//
// Usage:
//   const anchorRef = useRef()
//   const pos = useDropdownPosition(anchorRef, open, { estimatedHeight: 240 })
//   ...
//   {open && pos && <div style={{ position: 'fixed', top: pos.top, left: pos.left, ...}} />}
export function useDropdownPosition(anchorRef, open, opts = {}) {
  const {
    estimatedHeight = 240,     // conservative upper bound on the panel height
    minSpaceBelow   = 120,     // if < this below, flip up
    gap             = 4,       // vertical gap between anchor and panel
  } = opts
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!open) { setPos(null); return }
    const measure = () => {
      const el = anchorRef.current
      if (!el) return
      const r  = el.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      const spaceBelow = vh - r.bottom
      const spaceAbove = r.top
      const flipUp = spaceBelow < minSpaceBelow && spaceAbove > spaceBelow
      const top  = flipUp
        ? Math.max(8, r.top - gap - Math.min(estimatedHeight, spaceAbove - 8))
        : r.bottom + gap
      // Clamp left so a wide panel doesn't overflow the right edge. We don't
      // know the panel width here exactly, so use an estimate capped at 280.
      const panelW = 280
      const left = Math.min(r.left, vw - panelW - 8)
      setPos({ top, left: Math.max(8, left), placement: flipUp ? 'up' : 'down' })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorRef, estimatedHeight, minSpaceBelow, gap])

  return pos
}
