import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

async function doSignOut(request: NextRequest) {
  let response = NextResponse.json({ ok: true })

  const storedCookies: Array<{ name: string; value: string; options?: any }> = []

  // Use new publishable key, fallback to legacy anon key for backward compatibility
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          storedCookies.length = 0
          cookiesToSet.forEach(({ name, value, options }) => {
            storedCookies.push({ name, value, options })
            request.cookies.set(name, value)
          })
          response = NextResponse.json({ ok: true })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  await supabase.auth.signOut()

  // Build a redirect after signout so cookies are cleared on the response actually sent to the browser
  const redirectTo = new URL('/', request.url)
  const redirectResponse = NextResponse.redirect(redirectTo)
  const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
  storedCookies.forEach(({ name, value, options }) => {
    const cookieOptions = options || {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }
    if (cookieDomain && !cookieDomain.includes('localhost')) {
      cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
    }
    redirectResponse.cookies.set(name, value, cookieOptions)
  })

  return redirectResponse
}

export async function POST(request: NextRequest) {
  return doSignOut(request)
}

export async function GET(request: NextRequest) {
  // Allow GET for convenience when calling from anchors
  return doSignOut(request)
}