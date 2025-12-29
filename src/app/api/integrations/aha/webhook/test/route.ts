import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings-db';
import { canRolesPerform } from '@/lib/permissions';
import { POST as webhookHandler } from '../route';

export async function POST(req: NextRequest) {
    try {
        // Read request body first to get webhook URL if provided
        let body: { webhookUrl?: string } = {};
        try {
            body = await req.json();
        } catch {
            // Body might be empty, that's okay
        }
        
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check permission to test webhook
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }
        
        // Allow users who can view webhook URL to test it
        const ok = await canRolesPerform((me?.roles as string[]) || [], 'settings.webhookUrl.read');
        if (!ok) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const settings = await getSettings();
        
        // Try to get webhook URL from request body first (if frontend sends it), then from settings
        let webhookUrl = body.webhookUrl || settings.aha_webhook_url;
        
        console.log('Webhook test - URL sources:', {
            fromBody: body.webhookUrl,
            fromSettings: settings.aha_webhook_url,
            finalUrl: webhookUrl
        });
        
        // If no custom URL is set, construct from environment or request headers
        if (!webhookUrl || webhookUrl.trim() === '') {
            if (process.env.NEXT_PUBLIC_APP_URL) {
                webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/aha/webhook`;
            } else {
                // Fallback to constructing from request headers
                const host = req.headers.get('host') || 'localhost:3000';
                const protocol = req.headers.get('x-forwarded-proto') || 
                                (host.includes('localhost') ? 'http' : 'https');
                webhookUrl = `${protocol}://${host}/api/integrations/aha/webhook`;
            }
        }
        
        // Normalize webhookUrl - if it's relative, make it absolute
        if (webhookUrl.startsWith('/')) {
            const host = req.headers.get('host') || 'localhost:3000';
            const protocol = req.headers.get('x-forwarded-proto') || 
                            (host.includes('localhost') ? 'http' : 'https');
            webhookUrl = `${protocol}://${host}${webhookUrl}`;
        }

        // Use the configured Aha! Integration Tags from settings
        // If no tags are configured, fall back to default tags
        const configuredTags = settings.aha_tags || ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'];
        // Use all configured tags for the test to ensure it matches the filter
        const testTags = configuredTags.length > 0 ? configuredTags : ['LaunchConsole'];

        // Create a test payload with a test epic ID that won't try to fetch from Aha
        const testEpicId = "TEST-WEBHOOK-" + Date.now();
        const testPayload = {
            event: "epic.updated",
            epic: {
                id: testEpicId,
                reference_num: "CLEAR-TEST-" + Date.now(),
                name: "Test Epic from Webhook Test",
                url: "https://clearco.aha.io/epics/TEST",
                tags: testTags, // Use configured tags from settings
                assigned_to_user: {
                    email: user.email || "test@clearcompany.com"
                },
                custom_fields: {
                    launch_tier: {
                        value: "Tier 2"
                    }
                }
            }
        };

        // Use the configured webhook URL as the endpoint to test
        const webhookEndpoint = webhookUrl;

        // Send test webhook via HTTP (more reliable than trying to call handler directly)
        try {
            const response = await fetch(webhookEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testPayload),
            });

            const responseText = await response.text();
            let responseData: any;
            let isHtmlResponse = false;
            
            // Check if response is HTML (like ngrok error pages)
            if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
                isHtmlResponse = true;
                
                // Try to extract error message from HTML
                // Look for common error patterns in HTML
                const ngrokOfflineMatch = responseText.match(/The endpoint ([^\s]+) is offline/i);
                const ngrokErrorMatch = responseText.match(/ERR_NGROK_(\d+)/i);
                const ngrokWarningMatch = responseText.match(/You are about to visit|ngrok-free\.dev/i);
                
                // Try to extract from base64 payload first (most reliable)
                const payloadMatch = responseText.match(/data-payload="([^"]+)"/i);
                let extractedError = '';
                let isNgrokWarning = false;
                
                // Helper function to check if text looks like an error message (not HTML tags/scripts)
                const isValidErrorText = (text: string): boolean => {
                    if (!text || text.trim().length === 0) return false;
                    // Reject HTML tags, script references, and other artifacts
                    if (text.includes('<') || text.includes('>') || text.includes('src=') || text.includes('async=')) return false;
                    // Reject single-word app names
                    if (text.match(/^[A-Z][a-z]+$/)) return false;
                    // Reject file paths/URLs that aren't error messages
                    if (text.match(/^[a-z_]+\.(js|css|html|png|jpg|svg)/i)) return false;
                    return true;
                };
                
                // Check for ngrok-specific patterns first (highest priority)
                if (ngrokOfflineMatch) {
                    extractedError = `Ngrok tunnel is offline: ${ngrokOfflineMatch[1]}`;
                    if (ngrokErrorMatch) {
                        extractedError += ` (Error code: ERR_NGROK_${ngrokErrorMatch[1]})`;
                    }
                } else if (ngrokWarningMatch || responseText.includes('ngrok-free.dev') || responseText.includes('You are about to visit')) {
                    // This is likely ngrok free tier browser warning
                    isNgrokWarning = true;
                    extractedError = 'Ngrok free tier browser warning page detected';
                } else if (payloadMatch && payloadMatch[1]) {
                    // Try to decode base64 payload
                    try {
                        const decoded = JSON.parse(Buffer.from(payloadMatch[1], 'base64').toString());
                        // Prioritize message over title, and filter out generic app names
                        const errorMsg = decoded.message || '';
                        const errorTitle = decoded.title || '';
                        
                        // Check if it's a ngrok offline error
                        if (errorMsg.includes('is offline') || errorMsg.includes('offline')) {
                            const endpointMatch = errorMsg.match(/endpoint ([^\s]+)/i);
                            if (endpointMatch) {
                                extractedError = `Ngrok tunnel is offline: ${endpointMatch[1]}`;
                            } else if (isValidErrorText(errorMsg)) {
                                extractedError = errorMsg;
                            }
                        } else if (isValidErrorText(errorMsg)) {
                            extractedError = errorMsg;
                        } else if (errorTitle && errorTitle.includes('offline')) {
                            extractedError = errorTitle;
                        } else if (isValidErrorText(errorTitle)) {
                            extractedError = errorTitle;
                        }
                    } catch (e) {
                        // If base64 decode fails, continue to other methods
                    }
                }
                
                // If we still don't have an error, try other extraction methods
                if (!extractedError) {
                    // Try to extract from noscript (often contains the actual error)
                    const noscriptMatch = responseText.match(/<noscript>([^<]+)<\/noscript>/i);
                    if (noscriptMatch) {
                        const noscriptText = noscriptMatch[1].trim();
                        if (isValidErrorText(noscriptText)) {
                            extractedError = noscriptText;
                        }
                    }
                    
                    // Try title as last resort, but filter out generic names and HTML artifacts
                    if (!extractedError) {
                        const titleMatch = responseText.match(/<title>([^<]+)<\/title>/i);
                        if (titleMatch) {
                            const titleText = titleMatch[1].trim();
                            // Only use title if it contains error-related keywords or is descriptive
                            if ((titleText.includes('offline') || 
                                titleText.includes('error') || 
                                titleText.includes('not found') ||
                                titleText.includes('ngrok')) &&
                                isValidErrorText(titleText)) {
                                extractedError = titleText;
                            }
                        }
                    }
                    
                    // Final fallback: extract text content from common error patterns
                    if (!extractedError) {
                        const textMatch = responseText.match(/is offline[^<]*/i) || 
                                        responseText.match(/Not Found[^<]*/i) ||
                                        responseText.match(/Error[^<]*/i);
                        if (textMatch && isValidErrorText(textMatch[0])) {
                            extractedError = textMatch[0].trim();
                        } else {
                            // Default to a generic but helpful message
                            extractedError = 'Received HTML error page instead of JSON response';
                        }
                    }
                }
                
                // Build helpful note based on error type
                let note = '';
                if (isNgrokWarning || webhookEndpoint.includes('ngrok-free.dev')) {
                    note = 'Ngrok free tier shows a browser warning page that blocks automated requests. ';
                    note += 'Solutions: 1) Visit the ngrok URL in a browser first to bypass the warning, ';
                    note += '2) Upgrade to ngrok paid plan, or 3) Use a different tunneling service.';
                } else if (ngrokOfflineMatch || extractedError.includes('offline')) {
                    note = 'The ngrok tunnel appears to be offline. Make sure ngrok is running: `ngrok http 3000` (or your port).';
                } else if (webhookEndpoint.includes('ngrok')) {
                    note = 'Received HTML error page from ngrok. The tunnel may be offline or misconfigured.';
                } else {
                    note = 'Received HTML error page instead of JSON response. The endpoint may be offline or misconfigured.';
                }
                
                responseData = { 
                    message: extractedError,
                    htmlResponse: true,
                    note: note
                };
            } else {
                // Try to parse as JSON
                try {
                    responseData = JSON.parse(responseText);
                } catch {
                    responseData = { message: responseText.substring(0, 500) };
                }
            }

            // Log the full response for debugging
            console.log('Webhook test response:', {
                status: response.status,
                ok: response.ok,
                isHtmlResponse,
                webhookEndpoint,
                responseData,
                responseTextPreview: responseText.substring(0, 200), // First 200 chars for debugging
            });

            if (response.ok && !isHtmlResponse) {
                return NextResponse.json({
                    success: true,
                    message: 'Webhook test sent successfully. Check server logs for processing details.',
                    webhookUrl: webhookUrl,
                    endpoint: webhookEndpoint,
                    status: response.status,
                    response: responseData,
                });
            } else {
                // Extract detailed error information
                // Filter out HTML tags, script references, and generic app names
                let errorDetails = responseData.details || responseData.error || responseData.message || 'Unknown error';
                
                // Clean up error details if it contains HTML artifacts
                if (typeof errorDetails === 'string') {
                    // Filter out HTML tags, script references, and file paths
                    if (errorDetails.includes('<') || 
                        errorDetails.includes('>') || 
                        errorDetails.includes('src=') || 
                        errorDetails.includes('async=') ||
                        errorDetails.match(/\.(js|css|html|png|jpg|svg)/i)) {
                        // It's HTML/script content, use a generic message instead
                        errorDetails = 'Received HTML error page from webhook endpoint';
                    } else if (errorDetails.match(/^[A-Z][a-z]+$/) && isHtmlResponse) {
                        // It's likely just an app name from HTML title
                        errorDetails = 'Received HTML error page from webhook endpoint';
                    }
                }
                
                const fullError = typeof errorDetails === 'string' 
                    ? errorDetails 
                    : JSON.stringify(errorDetails);
                
                // Build helpful message
                let errorMessage = 'Webhook test failed';
                let hint = '';
                
                if (isHtmlResponse) {
                    // Use the extracted error message, or fallback to generic message
                    errorMessage = (responseData.message && !responseData.message.match(/^[A-Z][a-z]+$/)) 
                        ? responseData.message 
                        : 'Webhook endpoint returned an error page';
                    hint = responseData.note || 'The endpoint may be offline or misconfigured.';
                    
                    // Don't add duplicate hint if note already contains ngrok info
                    if (webhookEndpoint.includes('ngrok') && !hint.includes('ngrok')) {
                        hint += ' If using ngrok, make sure the tunnel is running: `ngrok http 3000` (or your port).';
                    }
                } else {
                    hint = 'Note: Test epics will fail to fetch from Aha, but the webhook endpoint should still process them using the payload data.';
                }
                
                return NextResponse.json({
                    success: false,
                    message: errorMessage,
                    webhookUrl: webhookUrl,
                    endpoint: webhookEndpoint,
                    status: response.status,
                    response: responseData,
                    error: fullError,
                    details: responseData.details,
                    hint: hint,
                }, { status: 200 }); // Return 200 so we can show the error details
            }
        } catch (fetchError: any) {
            console.error("Failed to send webhook test:", fetchError);
            return NextResponse.json({
                success: false,
                message: 'Failed to send webhook test request',
                webhookUrl: webhookUrl,
                endpoint: webhookEndpoint, // This is now the same as webhookUrl
                error: fetchError.message || String(fetchError),
                hint: 'Make sure the webhook URL is accessible and the server is running',
            }, { status: 200 });
        }
    } catch (error: any) {
        console.error("Error testing webhook:", error);
        return NextResponse.json(
            { 
                success: false,
                error: error.message || "Failed to test webhook",
                details: error.stack 
            },
            { status: 500 }
        );
    }
}

