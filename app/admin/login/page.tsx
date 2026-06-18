'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/admin'

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push(from)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Kirjautuminen epäonnistui')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold text-white mb-1">Helsinki Tapahtumat</div>
          <div className="text-gray-400 text-sm">Admin-kirjautuminen</div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 border border-white/8">
          <label className="block text-sm text-gray-400 mb-2">Salasana</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
            placeholder="••••••••"
            autoFocus
          />

          {error && (
            <div className="text-red-400 text-sm mb-4 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Kirjaudutaan...' : 'Kirjaudu sisään'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
