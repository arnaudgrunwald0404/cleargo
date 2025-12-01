import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const envVars = {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET (hidden)' : 'NOT SET',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
        NODE_ENV: process.env.NODE_ENV,
    }

    return NextResponse.json({
        message: 'Debug endpoint',
        environment: envVars,
        timestamp: new Date().toISOString(),
    })
}
