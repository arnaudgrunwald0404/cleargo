export const ROLES = [
  'CPO',
  'PRODUCT_LEAD',
  'PM',
  'PMM',
  'ENG_LEAD',
  'SUPPORT_LEAD',
  'SECURITY',
  'LEARNING',
  'PRODUCT_OPS',
  'OTHER',
] as const;

export const DEFAULT_EMAIL_TEMPLATES = {
  invite_subject: 'Welcome to ClearGO',
  invite_html: `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">{{greeting}}</h2>
    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
        You've been invited to join ClearGO. Click the button below to get started.
    </p>
    <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
        <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Track and manage launch readiness across all your products and initiatives</li>
            <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
            <li>Get real-time visibility into launch status, risks, and readiness scores</li>
        </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{inviteLink}}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            Accept Invitation
        </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        This link expires in 30 minutes and can be used once. If you didn't request this invitation, you can safely ignore this email.
    </p>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{inviteLink}}" style="color: #4f46e5; word-break: break-all;">{{inviteLink}}</a>
    </p>
</div>`,
  remind_subject: 'Reminder: Join ClearGO',
  remind_html: `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">{{greeting}}</h2>
    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
        This is a reminder that you have an invitation to join ClearGO. Click the button below to accept your invitation.
    </p>
    <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
        <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Track and manage launch readiness across all your products and initiatives</li>
            <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
            <li>Get real-time visibility into launch status, risks, and readiness scores</li>
        </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{inviteLink}}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            Accept Invitation
        </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        This link expires in 30 minutes and can be used once. If you've already joined, you can safely ignore this email.
    </p>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{inviteLink}}" style="color: #4f46e5; word-break: break-all;">{{inviteLink}}</a>
    </p>
</div>`,
  update_criteria_subject: 'Action Required: Update Criteria in ClearGO',
  update_criteria_html: `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">{{greeting}}</h2>
    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
        You have criteria that require your attention in ClearGO. Please review and update as needed.
    </p>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{actionLink}}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            View Criteria
        </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{actionLink}}" style="color: #4f46e5; word-break: break-all;">{{actionLink}}</a>
    </p>
</div>`,
} as const;
