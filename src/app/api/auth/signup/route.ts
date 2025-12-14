import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_DOMAIN = 'clearcompany.com';

// Default app settings from insert-settings.js
const DEFAULT_SETTINGS = {
    id: 1,
    fallback_user_email: 'agrunwald@clearcompany.com',
    email_sender: 'noreply@tacticalsync.com',
    threshold_tier1: 0.9,
    threshold_tier2: 0.8,
    threshold_tier3: 0.7,
    staleness_days: 14,
    digest_schedule: 'MON_09_00',
    timezone: 'America/New_York',
    allowlisted_domains: ['clearcompany.com'],
};

function validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email) {
        return { valid: false, error: 'Email is required' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Please enter a valid email address' };
    }
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain !== ALLOWED_DOMAIN) {
        return { valid: false, error: `Only @${ALLOWED_DOMAIN} email addresses are allowed` };
    }
    return { valid: true };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = body;

        // Validate email domain
        const validation = validateEmail(email);
        if (!validation.valid) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        // Validate password
        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters' },
                { status: 400 }
            );
        }

        // Use service role key for admin operations
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (!supabaseKey || !supabaseUrl) {
            console.error('Missing Supabase credentials');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email for internal users
        });

        if (authError) {
            console.error('Auth error:', authError);
            // Handle specific errors
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                return NextResponse.json(
                    { error: 'An account with this email already exists. Please sign in instead.' },
                    { status: 400 }
                );
            }
            return NextResponse.json(
                { error: authError.message || 'Failed to create account' },
                { status: 400 }
            );
        }

        if (!authData.user) {
            return NextResponse.json(
                { error: 'Failed to create user account' },
                { status: 500 }
            );
        }

        // Extract name from email (before @)
        const emailName = email.split('@')[0];
        const formattedName = emailName
            .split(/[._-]/)
            .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');

        // Create app_user record
        const { error: userError } = await supabaseAdmin
            .from('app_user')
            .upsert({
                id: authData.user.id,
                email: email.toLowerCase(),
                name: formattedName,
                role: 'OTHER',
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'email',
            });

        if (userError) {
            console.error('Error creating app_user:', userError);
            // Don't fail the signup if app_user creation fails
            // The user can still sign in, and we can handle this later
        }

        // Ensure app_settings exists with defaults
        const { error: settingsError } = await supabaseAdmin
            .from('app_settings')
            .upsert(DEFAULT_SETTINGS, {
                onConflict: 'id',
            });

        if (settingsError) {
            console.error('Error ensuring app_settings:', settingsError);
            // Don't fail signup for settings error
        }

        return NextResponse.json({
            success: true,
            requiresConfirmation: false, // We auto-confirm internal users
            message: 'Account created successfully',
        });

    } catch (error: any) {
        console.error('Signup error:', error);
        return NextResponse.json(
            { error: error?.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}

