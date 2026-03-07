import { Resend } from "resend";

const sender = process.env.EMAIL_SENDER || "noreply@tacticalsync.com";
const apiKey = process.env.RESEND_API_KEY;

export async function sendMagicLinkEmail(to: string, link: string) {
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  const resend = new Resend(apiKey);
  
  // Extract name from email (before @)
  const emailName = to.split("@")[0];
  const firstName = emailName
    .split(/[._-]/)
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  
  const result = await resend.emails.send({
    from: sender,
    to,
    subject: "Your ClearGO sign-in link",
    html: `
      <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">${greeting}</h2>
        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
          You requested a magic link to sign in to ClearGO. Click the button below to securely sign in to your account.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            Sign In to ClearGO
          </a>
        </div>
        <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="color: #374151; font-weight: 600; margin-bottom: 8px; font-size: 14px;">🔒 Security Note</p>
          <p style="color: #4b5563; line-height: 1.6; margin: 0; font-size: 14px;">
            This link expires in 12 hours and can only be used once. If you didn't request this link, you can safely ignore this email.
          </p>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${link}" style="color: #4f46e5; word-break: break-all;">${link}</a>
        </p>
        <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Having trouble? You can also sign in with your password at <a href="${link.split('/api/auth/verify')[0]}/login" style="color: #4f46e5;">the login page</a>.
        </p>
      </div>
    `
  });
  
  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message || JSON.stringify(result.error)}`);
  }
}
