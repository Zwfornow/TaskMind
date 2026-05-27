import { useEffect, useRef, useState } from 'react'

interface FlipDigitProps {
  value: string
}

export function FlipDigit({ value }: FlipDigitProps) {
  const prevRef = useRef(value)
  const [animPrev, setAnimPrev] = useState(value)
  const [animCurrent, setAnimCurrent] = useState(value)
  const [phase, setPhase] = useState<0 | 1 | 2>(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (value === prevRef.current) return

    const oldValue = prevRef.current
    prevRef.current = value

    // Clear any running animation
    timers.current.forEach(clearTimeout)
    timers.current = []

    setAnimPrev(oldValue)
    setAnimCurrent(value)
    setPhase(1)

    // Phase 1 → Phase 2 after top flap finishes (300ms)
    const t1 = setTimeout(() => {
      setPhase(2)
      // Phase 2 → idle after bottom flap finishes (300ms)
      const t2 = setTimeout(() => setPhase(0), 300)
      timers.current.push(t2)
    }, 300)
    timers.current.push(t1)
  }, [value])

  // Cleanup on unmount
  useEffect(() => {
    return () => { timers.current.forEach(clearTimeout) }
  }, [])

  return (
    <div className="flip-digit">
      {/* Upper half: always shows new value (top half clipped) */}
      <div className="flip-digit-upper">
        <div className="flip-num">{animCurrent}</div>
      </div>

      {/* Lower half: shows old value during animation, new value when done */}
      <div className="flip-digit-lower">
        <div className="flip-num">{phase === 0 ? animCurrent : animPrev}</div>
      </div>

      {/* Center divider line */}
      <div className="flip-divider" />

      {/* Phase 1: old top half folds down */}
      {phase === 1 && (
        <div className="flip-flap flip-flap-top">
          <div className="flip-num">{animPrev}</div>
        </div>
      )}

      {/* Phase 2: new bottom half unfolds */}
      {phase === 2 && (
        <div className="flip-flap flip-flap-bottom">
          <div className="flip-num">{animCurrent}</div>
        </div>
      )}
    </div>
  )
}
