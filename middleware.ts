import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/pending', '/denied']
const FIRST_LOGIN_ROUTES = ['/change-password', '/profile-setup']
const AUTH_FLOW_ROUTES = [...PUBLIC_ROUTES, ...FIRST_LOGIN_ROUTES]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // ── Fire school is always public ─────────────────────────────────────────
  if (pathname.startsWith('/fire-school')) {
    return supabaseResponse
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Get personnel record ──────────────────────────────────────────────────
  const { data: personnel } = await supabase
    .from('personnel')
    .select('signup_status, is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()

  const status = personnel?.signup_status
  const isSysAdmin = personnel?.is_sys_admin ?? false

  // ── Route based on status ─────────────────────────────────────────────────
  switch (status) {
    case 'temp_password':
      if (!pathname.startsWith('/change-password')) {
        const url = request.nextUrl.clone()
        url.pathname = '/change-password'
        return NextResponse.redirect(url)
      }
      break

    case 'profile_setup':
      if (!pathname.startsWith('/profile-setup')) {
        const url = request.nextUrl.clone()
        url.pathname = '/profile-setup'
        return NextResponse.redirect(url)
      }
      break

    case 'active':
      if (AUTH_FLOW_ROUTES.some(r => pathname.startsWith(r))) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
      if (pathname.startsWith('/admin') && !isSysAdmin) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
      break

    case 'awaiting_approval':
      if (!pathname.startsWith('/pending')) {
        const url = request.nextUrl.clone()
        url.pathname = '/pending'
        return NextResponse.redirect(url)
      }
      break

    case 'denied':
      if (!pathname.startsWith('/denied')) {
        const url = request.nextUrl.clone()
        url.pathname = '/denied'
        return NextResponse.redirect(url)
      }
      break

    default:
      if (!pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
