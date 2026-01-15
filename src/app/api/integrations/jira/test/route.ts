import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { domain, email, api_token } = body;

        if (!domain || !email || !api_token) {
            return NextResponse.json(
                { success: false, message: 'Domain, email, and API token are required' },
                { status: 400 }
            );
        }

        // Test connection and fetch Cloud ID
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const domainUrl = `https://${cleanDomain}`;
        const auth = Buffer.from(`${email}:${api_token}`).toString('base64');
        
        // Fetch Cloud ID from tenant_info endpoint
        // According to Atlassian docs, this endpoint can be accessed without auth
        // But we'll try with Basic Auth first for consistency
        let tenantInfoResponse = await fetch(`${domainUrl}/_edge/tenant_info`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
            },
        });

        // If that fails with 401, try without auth (some instances allow unauthenticated access)
        if (!tenantInfoResponse.ok && tenantInfoResponse.status === 401) {
            tenantInfoResponse = await fetch(`${domainUrl}/_edge/tenant_info`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });
        }

        if (!tenantInfoResponse.ok) {
            const errorText = await tenantInfoResponse.text();
            return NextResponse.json({
                success: false,
                message: `Failed to fetch Cloud ID: ${tenantInfoResponse.status} ${errorText.substring(0, 200)}`,
            });
        }

        const tenantInfo = await tenantInfoResponse.json();
        const cloudId = tenantInfo.cloudId;

        if (!cloudId) {
            return NextResponse.json({
                success: false,
                message: `Cloud ID not found in tenant_info response. Response: ${JSON.stringify(tenantInfo)}`,
            });
        }

        // Test connection using domain-based URL (Basic Auth uses domain URLs, not Cloud ID URLs)
        // Cloud ID-based URLs are only for OAuth Bearer tokens
        const response = await fetch(`${domainUrl}/rest/api/3/myself`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({
                success: false,
                message: `Jira API error ${response.status}: ${errorText.substring(0, 200)}`,
            });
        }

        const userData = await response.json();
        
        return NextResponse.json({
            success: true,
            message: `Successfully connected to Jira as ${userData.displayName || userData.emailAddress || email}`,
            user: userData,
            cloudId: cloudId,
        });
    } catch (error: any) {
        console.error('Jira connection test error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to test Jira connection' },
            { status: 500 }
        );
    }
}
