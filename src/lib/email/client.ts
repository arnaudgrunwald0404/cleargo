import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
    console.warn('RESEND_API_KEY is not set. Email notifications will fail.');
}

export const resend = new Resend(resendApiKey);

export const EMAIL_SENDER = process.env.EMAIL_SENDER || 'Launch Console <noreply@tacticalsync.com>';
