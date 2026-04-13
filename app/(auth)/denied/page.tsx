import { signOut } from '@/app/actions/auth'

export default function DeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Account Access Denied</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Your account access has been denied. Please contact your department 
          administrator if you believe this is an error.
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-300 transition-colors"
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  )
}
