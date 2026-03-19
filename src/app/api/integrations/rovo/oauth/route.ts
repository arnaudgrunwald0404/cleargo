import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storeRovoTokens } from '@/lib/rovo/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RovoOAuthProvider } from '@/lib/rovo/mcp-client';
import { getSettings, getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

export async function GET(request: NextRequest) {
    try {
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

        const permRules = await getEffectivePermissionRules();
        const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.update', permRules);
        if (!canUpdate) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Handle OAuth errors
        if (error) {
            console.error('OAuth error:', error);
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/admin/settings/integrations/rovo?error=${encodeURIComponent(error)}`
            );
        }

        if (!code) {
            // Initiate OAuth flow
            // NOTE: ROVO MCP Server uses OAuth 2.1 with dynamic client registration
            // The standard Atlassian OAuth endpoint may not work directly with ROVO MCP Server
            // We're using Atlassian's standard OAuth as a workaround, but tokens may need to be
            // obtained through ROVO's own authorization server discovered via WWW-Authenticate header
            
            const clientId = process.env.ROVO_OAUTH_CLIENT_ID || process.env.ATLASSIAN_OAUTH_CLIENT_ID;
            const clientSecret = process.env.ROVO_OAUTH_CLIENT_SECRET || process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;
            
            if (!clientId) {
                return NextResponse.json(
                    { 
                        error: 'OAuth not configured',
                        message: 'ROVO_OAUTH_CLIENT_ID or ATLASSIAN_OAUTH_CLIENT_ID environment variable is required. Please create an Atlassian OAuth app at https://developer.atlassian.com/console/myapps/',
                    },
                    { status: 500 }
                );
            }
            
            // Construct redirect URI
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
            const redirectUri = `${baseUrl}/api/integrations/rovo/oauth`;
            
            // Log the redirect URI for debugging
            console.log('ROVO OAuth redirect URI:', redirectUri);
            
            // Generate state for CSRF protection
            const stateValue = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64');
            
            // Store state in session/cookie for validation
            // Use minimal granular scopes for ROVO search and summarize functionality
            // Classic scopes are preferred, but we need specific read permissions
            const scopes = [
                // Jira scopes - minimal read access for search and summarize
                'read:jira-work',           // Read Jira issues, epics, stories
                'read:jira-user',           // Read user information for context
                // Confluence scopes - minimal read access for search and summarize  
                'read:confluence-content.summary',  // Read Confluence page summaries
                'read:confluence-space.summary',    // Read Confluence space information
                // Required for refresh tokens
                'offline_access',
            ];
            
            const response = NextResponse.redirect(
                `${ATLASSIAN_AUTH_URL}/authorize?${new URLSearchParams({
                    audience: 'api.atlassian.com',
                    client_id: clientId,
                    scope: scopes.join(' '),
                    redirect_uri: redirectUri,
                    state: stateValue,
                    response_type: 'code',
                    prompt: 'consent', // Always request consent to ensure refresh token
                })}`
            );
            
            // Store state in cookie for validation
            response.cookies.set('rovo_oauth_state', stateValue, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 600, // 10 minutes
            });
            
            return response;
        }

        // Validate state
        const storedState = request.cookies.get('rovo_oauth_state')?.value;
        if (!state || state !== storedState) {
            return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
        }

        // For ROVO MCP Server with dynamic client registration, we may need to:
        // 1. Exchange code at the MCP server's token endpoint, OR
        // 2. Use Atlassian's standard token endpoint with special parameters
        
        // For ROVO MCP Server, we need to use the MCP SDK's OAuth flow
        // The MCP SDK handles dynamic client registration and token exchange
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const redirectUri = `${baseUrl}/api/integrations/rovo/oauth`;
        
        try {
            // Create a Streamable HTTP transport to finish the OAuth flow
            // Streamable HTTP is compatible with serverless environments (unlike SSE)
            const sessionId = `rovo-${Date.now()}`;
            const authProvider = new RovoOAuthProvider(redirectUri, sessionId);
            const transport = new StreamableHTTPClientTransport(
                new URL('https://mcp.atlassian.com/v1/mcp'),
                { authProvider }
            );
            
            // Finish the OAuth flow with the authorization code
            await transport.finishAuth(code);
            
            // The tokens should now be saved by the authProvider.saveTokens() method
            // Verify tokens were saved
            const settings = await getSettings();
            if (!settings.rovo_access_token) {
                throw new Error('Tokens were not saved after OAuth completion');
            }
            
            console.log('✅ ROVO OAuth completed successfully via MCP SDK');
        } catch (error: any) {
            console.error('MCP SDK OAuth error:', error);
            
            // Fallback: Try standard Atlassian OAuth if MCP SDK flow fails
            // This is a workaround - ideally we'd use MCP SDK's flow entirely
            const clientId = process.env.ROVO_OAUTH_CLIENT_ID || process.env.ATLASSIAN_OAUTH_CLIENT_ID;
            const clientSecret = process.env.ROVO_OAUTH_CLIENT_SECRET || process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;
            
            if (clientId && clientSecret) {
                console.log('Falling back to standard Atlassian OAuth...');
                const tokenResponse = await fetch(ATLASSIAN_TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        grant_type: 'authorization_code',
                        client_id: clientId,
                        client_secret: clientSecret,
                        code,
                        redirect_uri: redirectUri,
                    }),
                });

                if (tokenResponse.ok) {
                    const tokens = await tokenResponse.json();
                    if (tokens.access_token) {
                        const expiresIn = tokens.expires_in || 3600;
                        await storeRovoTokens(
                            tokens.access_token,
                            tokens.refresh_token || null,
                            expiresIn
                        );
                        console.log('✅ ROVO OAuth completed via fallback method');
                    } else {
                        throw new Error('No access token in fallback response');
                    }
                } else {
                    const errorText = await tokenResponse.text();
                    throw new Error(`Fallback OAuth failed: ${errorText}`);
                }
            } else {
                // No fallback available
                throw error;
            }
        }

        // Clear state cookie
        const successResponse = NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/admin/settings/integrations/rovo?connected=true`
        );
        successResponse.cookies.delete('rovo_oauth_state');
        
        return successResponse;
    } catch (error: any) {
        console.error('Error in ROVO OAuth:', error);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/admin/settings/integrations/rovo?error=${encodeURIComponent(error.message || 'OAuth flow failed')}`
        );
    }
}
