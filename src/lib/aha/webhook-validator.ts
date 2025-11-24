import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function getWebhookSecret(): Promise<string> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
        .from('app_settings')
        .select('aha_webhook_secret')
        .eq('id', 1)
        .single();

    if (error || !data?.aha_webhook_secret) {
        throw new Error('Aha webhook secret not configured in settings');
    }

    return data.aha_webhook_secret;
}

export async function verifyWebhookSignature(
    payload: string,
    signature: string | null
): Promise<boolean> {
    if (!signature) {
        console.warn('No webhook signature provided');
        return false;
    }

    const secret = await getWebhookSecret();
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}
