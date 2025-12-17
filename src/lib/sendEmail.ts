import { Resend } from 'resend';

const sender = process.env.EMAIL_SENDER || 'noreply@tacticalsync.com';
const apiKey = process.env.RESEND_API_KEY;

export async function sendMagicLinkEmail(to: string, link: string) {
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: sender,
    to,
    subject: 'Your magic sign-in link',
    html: `<p>Click to sign in: <a href="${link}">Sign in</a></p><p>This link expires in 30 minutes and can be used once.</p>`,
  });
}
