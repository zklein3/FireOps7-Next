'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signIn } from '@/app/actions/auth'

export interface LoginTheme {
  brand: string
  monogram: string
  category: string
  avatarBg: string       // e.g. 'bg-red-700'
  inputFocus: string     // e.g. 'focus:border-red-500 focus:ring-red-500'
  button: string         // e.g. 'bg-red-700 hover:bg-red-800'
  backHref: string
  backLabel: string
  icon?: React.ReactNode
}

const MUNIOPS_THEME: LoginTheme = {
  brand: 'MuniOps',
  monogram: 'MO',
  category: 'Municipal Operations Platform',
  avatarBg: 'bg-blue-800',
  inputFocus: 'focus:border-blue-600 focus:ring-blue-600',
  button: 'bg-blue-800 hover:bg-blue-700',
  backHref: '/',
  backLabel: 'MuniOps',
}

export default function LoginForm({ next, theme = MUNIOPS_THEME }: { next?: string; theme?: LoginTheme }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await signIn(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">

        {/* Back link */}
        <div className="mb-6">
          <Link href={theme.backHref} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            {theme.backLabel}
          </Link>
        </div>

        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${theme.avatarBg}`}>
            {theme.icon ?? <span className="text-2xl font-bold text-white">{theme.monogram}</span>}
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">{theme.brand}</h1>
          <p className="mt-1 text-xs font-medium text-zinc-400 uppercase tracking-widest">{theme.category}</p>
          <p className="mt-2 text-sm text-zinc-500">Sign in to your account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Form */}
        <form action={handleSubmit} className="flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={`w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 ${theme.inputFocus}`}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className={`w-full rounded-lg border border-zinc-300 px-3 py-2 pr-10 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 ${theme.inputFocus}`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 hover:text-zinc-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors ${theme.button}`}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Card-based board access — no account needed, see /board-guest/scan */}
        <Link
          href="/board-guest/scan"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2m10-14h2a1 1 0 011 1v2m-1 10h-2 2a1 1 0 001-1v-2M7 7h1v1H7V7zm9 0h1v1h-1V7zM7 16h1v1H7v-1zm9 0h1v1h-1v-1z" />
          </svg>
          Have an accountability card? Scan to access your board
        </Link>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Don&apos;t have an account? Contact your department administrator.
        </p>
      </div>
    </div>
  )
}
