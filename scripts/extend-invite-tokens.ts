import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createToken } from '../src/lib/jwt';
import { markTokenSent } from '../src/lib/tokenStore';
import { resend, EMAIL_SENDER } from '../src/lib/email/client';
import { getInviteEmail } from '../src/lib/email/templates';
import { getSettings } from '../src/lib/settings-db';
import { INVITE_EMAIL_LINK } from '../src/lib/constants/settings';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Script to extend validity of invitation tokens by generating new tokens
 * and optionally sending new invitation emails.
 * 
 * Since JWT tokens have expiration encoded in them, we can't extend existing tokens.
 * Instead, we generate new tokens and send new emails.
 */
async function main() {
  console.log('🔄 Starting invitation token extension...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in environment.');
    process.exit(1);
  }

  if (!process.env.MAGIC_LINK_SECRET) {
    console.error('❌ MAGIC_LINK_SECRET is not configured.');
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY is not configured.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all unused tokens (not yet used)
  console.log('📋 Fetching unused invitation tokens...');
  const { data: tokens, error: fetchError } = await supabase
    .from('used_magic_link_tokens')
    .select('*')
    .is('used_at', null)
    .order('sent_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Error fetching tokens:', fetchError);
    process.exit(1);
  }

  if (!tokens || tokens.length === 0) {
    console.log('✅ No unused tokens found.');
    return;
  }

  console.log(`📊 Found ${tokens.length} unused token(s)\n`);

  // Filter tokens that are expired or expiring soon (within next hour)
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  const tokensToExtend = tokens.filter(token => {
    const expiresAt = new Date(token.expires_at);
    return expiresAt <= oneHourFromNow;
  });

  if (tokensToExtend.length === 0) {
    console.log('✅ No tokens need extension (all are valid for more than 1 hour).');
    return;
  }

  console.log(`🔄 Found ${tokensToExtend.length} token(s) that need extension\n`);

  // Get email settings
  const settings = await getSettings();
  const customTemplate = {
    subject: settings.email_template_invite_subject,
    html: settings.email_template_invite_html,
  };

  // Extract email from EMAIL_SENDER
  let senderEmail = "noreply@info.tacticalsync.com";
  if (process.env.EMAIL_SENDER) {
    const emailMatch = process.env.EMAIL_SENDER.match(/<(.+)>/);
    senderEmail = emailMatch ? emailMatch[1] : process.env.EMAIL_SENDER;
  }
  const formattedSender = `ClearGO <${senderEmail}>`;

  let successCount = 0;
  let errorCount = 0;

  // Process each token
  for (const token of tokensToExtend) {
    try {
      console.log(`\n📧 Processing token for ${token.email}...`);
      console.log(`   Old token expires: ${new Date(token.expires_at).toISOString()}`);

      // Generate new token
      const newJti = randomUUID();
      const expiresIn = "12h";
      const newToken = await createToken(
        { email: token.email, jti: newJti, t: "magic" },
        expiresIn
      );

      // Calculate new expiration date (12 hours from now)
      const newExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      // Mark old token as used (so it can't be used anymore)
      const { error: markOldError } = await supabase
        .from('used_magic_link_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('jti', token.jti);

      if (markOldError) {
        console.error(`   ⚠️  Warning: Could not mark old token as used:`, markOldError);
      }

      // Mark new token as sent
      await markTokenSent(newJti, token.email, newExpiresAt);

      const inviteLink = INVITE_EMAIL_LINK;

      // Get user's first name if available
      const { data: user } = await supabase
        .from('app_user')
        .select('first_name')
        .eq('email', token.email)
        .single();

      // Send new invitation email
      const emailContent = await getInviteEmail(user?.first_name || null, inviteLink, customTemplate);

      const emailResponse = await resend.emails.send({
        from: formattedSender,
        to: token.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      if (emailResponse.error) {
        throw new Error(`Email send failed: ${emailResponse.error.message || JSON.stringify(emailResponse.error)}`);
      }

      console.log(`   ✅ New token generated and email sent`);
      console.log(`   New token expires: ${newExpiresAt.toISOString()}`);
      successCount++;
    } catch (error: any) {
      console.error(`   ❌ Error processing token for ${token.email}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successfully extended: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`\n✨ Done!`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
