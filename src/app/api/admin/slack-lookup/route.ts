import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSlackClient } from '@/lib/slack/client';
import { resolveRole, isAdminRole } from '@/lib/roles';
import { sendSlackNotification } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Authentication check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admin permission check
        const role = await resolveRole(user.email);
        if (!isAdminRole(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get email from query params
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || process.env.FALLBACK_USER_EMAIL || 'agrunwald@clearcompany.com';
        const sendTestMessage = searchParams.get('sendTest') === 'true';
        
        // Use production code path to lookup Slack user
        const client = getSlackClient();
        const response = await client.getUserByEmail(email);
        
        if (!response.user) {
            return NextResponse.json(
                { error: 'User not found in Slack workspace' },
                { status: 404 }
            );
        }

        const slackUserId = response.user.id;
        const result: any = {
            success: true,
            email,
            slackUserId,
            displayName: response.user.profile?.display_name || response.user.profile?.real_name,
            username: response.user.name,
            teamId: response.user.team_id,
        };

        // Send test DM message if requested
        if (sendTestMessage) {
            try {
                // Get user from database to check if they exist
                const { data: appUser } = await supabase
                    .from('app_user')
                    .select('id, email, first_name, last_name')
                    .eq('email', email)
                    .single();

                await sendSlackNotification({
                    type: 'delegation',
                    priority: 'medium',
                    recipient: {
                        id: appUser?.id || '',
                        email: email,
                        slack_handle: slackUserId,
                        name: appUser 
                            ? `${appUser.first_name || ''} ${appUser.last_name || ''}`.trim() || email
                            : response.user.profile?.display_name || response.user.profile?.real_name || email,
                    },
                    metadata: {
                        epic_name: 'Test Epic - Slack DM Test',
                        epic_id: 'test-epic-id',
                        task_label: 'Test Task',
                        category: 'TEST',
                        delegation_type: 'test',
                        delegated_by: 'System Test',
                        epic_url: process.env.NEXT_PUBLIC_APP_URL 
                            ? `${process.env.NEXT_PUBLIC_APP_URL}/epics/test-epic-id`
                            : undefined,
                    },
                });

                result.testMessage = {
                    sent: true,
                    message: 'Test DM message sent successfully',
                };
            } catch (dmError: any) {
                result.testMessage = {
                    sent: false,
                    error: dmError.message,
                };
                console.error('Failed to send test DM:', dmError);
            }
        }
        
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Slack lookup error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to lookup Slack user' },
            { status: 500 }
        );
    }
}

