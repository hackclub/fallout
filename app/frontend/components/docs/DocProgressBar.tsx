import { useEffect, useState } from 'react'

export default function DocProgressBar() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    function updateProgress() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? window.scrollY / scrollable : 0)
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    return () => window.removeEventListener('scroll', updateProgress)
  }, [])

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-2 bg-light-brown">
      <div className="h-full bg-brown" style={{ width: `${progress * 100}%` }} />
    </div>
  )
}
