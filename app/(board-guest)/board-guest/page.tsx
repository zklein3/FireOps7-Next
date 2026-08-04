import Link from 'next/link'

// Landing spot for anyone who arrives at /board-guest with no token in the URL (e.g. typed the
// base path directly, or bookmarked it) — otherwise this was a dead 404 with no way forward.
export default function BoardGuestLandingPage() {
  return (
    <div className="max-w-md mx-auto text-center">
      <h1 className="text-lg font-bold text-zinc-900 mb-2">Guest Board Access</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Scan the card an officer checked you in with to reach your accountability board — no account needed.
      </p>
      <Link
        href="/board-guest/scan"
        className="inline-block w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
      >
        Scan Your Card
      </Link>
      <p className="mt-4 text-xs text-zinc-400">
        Have a link an officer sent you instead? Open it directly — this page is only for card scanning.
      </p>
    </div>
  )
}
