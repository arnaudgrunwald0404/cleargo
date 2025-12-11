import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/by-email
 * 
 * Fetches user information (name, avatar) for a list of email addresses.
 * This endpoint is designed to work without authentication to support
 * email-to-name translation in public-facing views.
 * 
 * Query params:
 * - emails: comma-separated list of email addresses
 * 
 * Returns:
 * - Map of email -> { first_name, last_name, avatar_url }
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const emailsParam = searchParams.get('emails');
        
        if (!emailsParam) {
            return NextResponse.json(
                { error: 'emails parameter is required' },
                { status: 400 }
            );
        }
        
        // Parse comma-separated emails
        const emails = emailsParam
            .split(',')
            .map(email => email.trim().toLowerCase())
            .filter(email => email.length > 0);
        
        if (emails.length === 0) {
            return NextResponse.json({});
        }
        
        // Limit to prevent abuse
        if (emails.length > 100) {
            return NextResponse.json(
                { error: 'Maximum 100 emails allowed per request' },
                { status: 400 }
            );
        }
        
        const supabase = await createClient();
        
        // Fetch user info from app_user table
        const { data: users, error } = await supabase
            .from('app_user')
            .select('email, first_name, last_name, avatar_url')
            .in('email', emails);
        
        if (error) {
            console.error('Error fetching users by email:', error);
            return NextResponse.json(
                { error: 'Failed to fetch user information', details: error.message },
                { status: 500 }
            );
        }
        
        // Build a map of email -> user info
        const userMap: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};
        
        if (users) {
            users.forEach(user => {
                if (user.email) {
                    userMap[user.email.toLowerCase()] = {
                        first_name: user.first_name || undefined,
                        last_name: user.last_name || undefined,
                        avatar_url: user.avatar_url || undefined
                    };
                }
            });
        }
        
        return NextResponse.json(userMap);
    } catch (error: any) {
        console.error('Error in /api/users/by-email:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}




