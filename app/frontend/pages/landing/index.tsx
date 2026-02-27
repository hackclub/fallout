import { usePage, router } from '@inertiajs/react'
import { useState } from 'react'
import type { SharedProps } from '@/types'

export default function LandingIndex() {
  const shared = usePage<SharedProps>().props
  const [email, setEmail] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.post(shared.trial_session_path, { email })
  }

  return (
    <div>
      <h1 className="font-bold text-4xl">Welcome</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
        />
        <button type="submit">Get Started</button>
      </form>
      <a href={shared.sign_in_path}>Sign in with HCA</a>
    </div>
  )
}
