import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
    const cookieStore = cookies()

    // Check if we should bypass auth (only for development)
    const bypassAuth = process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV === 'development';

    if (bypassAuth) {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role to bypass RLS
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        // No-op for mocked auth
                    },
                    remove(name: string, options: CookieOptions) {
                        // No-op for mocked auth
                    },
                },
            }
        );

        // Mock auth.getUser
        const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
        supabase.auth.getUser = async () => {
            return {
                data: {
                    user: {
                        id: '00000000-0000-0000-0000-000000000000', // Dummy Auth ID
                        email: 'agrunwald@clearcompany.com',
                        app_metadata: {},
                        user_metadata: {},
                        aud: 'authenticated',
                        created_at: new Date().toISOString(),
                    } as any
                },
                error: null
            }
        };

        return supabase;
    }

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        cookieStore.set({ name, value, ...options })
                    } catch (error) {
                        // The `set` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        cookieStore.set({ name, value: '', ...options })
                    } catch (error) {
                        // The `delete` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}
