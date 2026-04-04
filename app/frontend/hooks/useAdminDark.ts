import { useState, useEffect } from 'react'

export function useAdminDark() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('admin-dark') === 'true'
  })

  useEffect(() => {
    const root = document.querySelector('.admin')
    if (!root) return
    root.classList.toggle('dark', dark)
    localStorage.setItem('admin-dark', String(dark))
  }, [dark])

  return [dark, () => setDark((d) => !d)] as const
}
