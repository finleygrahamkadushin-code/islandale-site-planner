import { useEffect, useState } from 'react'
import { usePlanStore } from '../store/planStore'

const TOAST_MS = 2500

export function Toast() {
  const toast = usePlanStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast || !visible) return null
  return (
    <div className="toast" role="status">
      {toast.text}
    </div>
  )
}
