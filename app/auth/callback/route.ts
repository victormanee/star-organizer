import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = request.nextUrl.searchParams.get('next')
  const destination = new URL(next?.startsWith('/') ? next : '/', request.url)

  if (code) {
    let response = NextResponse.redirect(destination)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: { secure: process.env.NODE_ENV === 'production' },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookies) {
            cookies.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.redirect(destination)
            cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          },
        },
      },
    )
    await supabase.auth.exchangeCodeForSession(code)
    return response
  }

  return NextResponse.redirect(new URL('/?auth-error=missing-code', request.url))
}
