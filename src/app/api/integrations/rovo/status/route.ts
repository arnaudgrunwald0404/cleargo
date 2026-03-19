import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testRovoConnection } from '@/lib/rovo/client';
import { getSettings, getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export async function GET(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability check: settings.update
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) throw userError;

        const rules = await getEffectivePermissionRules();
        const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.update', rules);
        if (!canUpdate) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const settings = await getSettings();
        const hasToken = !!settings.rovo_access_token;
        const expiresAt = settings.rovo_token_expires_at;
        
        let connectionStatus = {
            connected: false,
            message: 'Not connected',
            expiresAt: null as string | null,
        };

        if (hasToken) {
            if (expiresAt) {
                const expirationDate = new Date(expiresAt);
                const now = new Date();
                const isExpired = expirationDate.getTime() - now.getTime() < 0;
                
                connectionStatus = {
                    connected: !isExpired,
                    message: isExpired ? 'Token expired' : 'Connected',
                    expiresAt: expiresAt,
                };
            } else {
                connectionStatus = {
                    connected: true,
                    message: 'Connected (no expiration date)',
                    expiresAt: null,
                };
            }

            // Test actual connection if token exists
            if (connectionStatus.connected) {
                try {
                    const testResult = await testRovoConnection();
                    connectionStatus.message = testResult.message;
                    connectionStatus.connected = testResult.success;
                    
                    // If test failed, update message to be more specific
                    if (!testResult.success) {
                        connectionStatus.message = testResult.message || 'Connection test failed';
                    }
                } catch (error: any) {
                    // Check if it's an authentication error
                    const errorMessage = error.message || 'Connection test failed';
                    
                    // Check for serverless compatibility issues
                    if (errorMessage.includes('EventSource') || errorMessage.includes('SSE') || errorMessage.includes('stream') || errorMessage.includes('serverless')) {
                        connectionStatus.message = 'MCP SDK transport may not be compatible with serverless environments. Consider using direct HTTP requests instead.';
                        connectionStatus.connected = false;
                    } else if (errorMessage.includes('authentication failed') || errorMessage.includes('invalid') || errorMessage.includes('expired')) {
                        connectionStatus.message = 'Token is invalid or expired. Please reconnect ROVO.';
                        connectionStatus.connected = false;
                    } else {
                        connectionStatus.message = `Connection test failed: ${errorMessage}`;
                        connectionStatus.connected = false;
                    }
                    
                    // If token was cleared due to 401, refresh settings
                    const updatedSettings = await getSettings();
                    if (!updatedSettings.rovo_access_token) {
                        connectionStatus.message = 'Token was invalid and has been cleared. Please reconnect ROVO.';
                    }
                    
                    // Log the full error for debugging
                    console.error('ROVO connection test error details:', {
                        message: errorMessage,
                        stack: error.stack,
                        name: error.name,
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            ...connectionStatus,
        });
    } catch (error: any) {
        console.error('ROVO status error:', error);
        return NextResponse.json(
            { 
                error: 'Failed to check status',
                message: error.message || 'Failed to check ROVO connection status',
            },
            { status: 500 }
        );
    }
}
