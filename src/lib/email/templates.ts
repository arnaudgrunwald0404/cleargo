import { diffCalendarDaysBetweenYmd, getCalendarDateStringInTimeZone } from '@/lib/date-utils';

export function getLaunchStatusChangeEmail(
    launchName: string,
    oldStatus: string,
    newStatus: string,
    launchUrl: string
) {
    return {
        subject: `[Launch Console] Status Change: ${launchName}`,
        html: `
            <h2>Launch Status Changed</h2>
            <p>The readiness status for <strong>${launchName}</strong> has changed.</p>
            <ul>
                <li><strong>Old Status:</strong> ${oldStatus}</li>
                <li><strong>New Status:</strong> ${newStatus}</li>
            </ul>
            <p><a href="${launchUrl}">View Launch</a></p>
        `
    };
}

export function getRiskAlertEmail(
    launchName: string,
    riskLevel: string,
    reason: string,
    launchUrl: string
) {
    return {
        subject: `[Launch Console] Risk Alert: ${launchName}`,
        html: `
            <h2 style="color: red;">High Risk Alert</h2>
            <p>The risk level for <strong>${launchName}</strong> is now <strong>${riskLevel}</strong>.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p><a href="${launchUrl}">View Launch</a></p>
        `
    };
}

function getDefaultInviteEmail(firstName: string | null, inviteLink: string) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
    return {
        subject: 'Welcome to ClearGO',
        html: `
            <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">${greeting}</h2>
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
                    <a href="${inviteLink}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                        Accept Invitation
                    </a>
                </div>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    This link expires in 30 minutes and can be used once. If you didn't request this invitation, you can safely ignore this email.
                </p>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${inviteLink}" style="color: #4f46e5; word-break: break-all;">${inviteLink}</a>
                </p>
            </div>
        `
    };
}

export async function getInviteEmail(
    firstName: string | null,
    inviteLink: string,
    customTemplate?: { subject?: string | null; html?: string | null }
) {
    const defaultEmail = getDefaultInviteEmail(firstName, inviteLink);
    
    // Use custom template if provided, otherwise use default
    const subject = customTemplate?.subject || defaultEmail.subject;
    let html = customTemplate?.html || defaultEmail.html;
    
    // Replace placeholders in custom template
    if (customTemplate?.html) {
        html = html
            .replace(/\{\{firstName\}\}/g, firstName || '')
            .replace(/\{\{greeting\}\}/g, firstName ? `Hi ${firstName},` : 'Hello,')
            .replace(/\{\{inviteLink\}\}/g, inviteLink);
    }
    
    return { subject, html };
}

function getDefaultRemindEmail(firstName: string | null, inviteLink: string) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
    return {
        subject: 'Reminder: Join ClearGO',
        html: `
            <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">${greeting}</h2>
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
                    <a href="${inviteLink}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                        Accept Invitation
                    </a>
                </div>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    This link expires in 30 minutes and can be used once. If you've already joined, you can safely ignore this email.
                </p>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${inviteLink}" style="color: #4f46e5; word-break: break-all;">${inviteLink}</a>
                </p>
            </div>
        `
    };
}

export async function getRemindEmail(
    firstName: string | null,
    inviteLink: string,
    customTemplate?: { subject?: string | null; html?: string | null }
) {
    const defaultEmail = getDefaultRemindEmail(firstName, inviteLink);
    
    // Use custom template if provided, otherwise use default
    const subject = customTemplate?.subject || defaultEmail.subject;
    let html = customTemplate?.html || defaultEmail.html;
    
    // Replace placeholders in custom template
    if (customTemplate?.html) {
        html = html
            .replace(/\{\{firstName\}\}/g, firstName || '')
            .replace(/\{\{greeting\}\}/g, firstName ? `Hi ${firstName},` : 'Hello,')
            .replace(/\{\{inviteLink\}\}/g, inviteLink);
    }
    
    return { subject, html };
}

function getDefaultApprovalEmail(firstName: string | null, appUrl: string) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
    return {
        subject: 'Your ClearGO Access Has Been Approved',
        html: `
            <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">${greeting}</h2>
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Great news! Your access request for ClearGO has been approved. You can now sign in and start using the platform.
                </p>
                <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0; border-radius: 4px;">
                    <p style="color: #065f46; font-weight: 600; margin-bottom: 8px; font-size: 15px;">✓ Access Approved</p>
                    <p style="color: #047857; line-height: 1.6; margin: 0; font-size: 14px;">
                        You now have access to ClearGO. Sign in to track launch readiness, collaborate with your team, and manage product launches.
                    </p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${appUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                        Sign In to ClearGO
                    </a>
                </div>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    If you have any questions or need assistance, please contact your Product Ops team.
                </p>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${appUrl}" style="color: #4f46e5; word-break: break-all;">${appUrl}</a>
                </p>
            </div>
        `
    };
}

export async function getApprovalEmail(
    firstName: string | null,
    appUrl: string,
    customTemplate?: { subject?: string | null; html?: string | null }
) {
    const defaultEmail = getDefaultApprovalEmail(firstName, appUrl);
    
    // Use custom template if provided, otherwise use default
    const subject = customTemplate?.subject || defaultEmail.subject;
    let html = customTemplate?.html || defaultEmail.html;
    
    // Replace placeholders in custom template
    if (customTemplate?.html) {
        html = html
            .replace(/\{\{firstName\}\}/g, firstName || '')
            .replace(/\{\{greeting\}\}/g, firstName ? `Hi ${firstName},` : 'Hello,')
            .replace(/\{\{appUrl\}\}/g, appUrl);
    }
    
    return { subject, html };
}

function getDefaultDenialEmail(firstName: string | null, appUrl: string) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
    return {
        subject: 'ClearGO Access Request Update',
        html: `
            <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">${greeting}</h2>
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Thank you for your interest in ClearGO. Unfortunately, we are unable to approve your access request at this time.
                </p>
                <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 4px;">
                    <p style="color: #991b1b; font-weight: 600; margin-bottom: 8px; font-size: 15px;">Access Request Denied</p>
                    <p style="color: #b91c1c; line-height: 1.6; margin: 0; font-size: 14px;">
                        Your access request has been reviewed and denied. If you believe this is an error or have questions, please contact your Product Ops team.
                    </p>
                </div>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    If you have any questions or need assistance, please contact your Product Ops team.
                </p>
            </div>
        `
    };
}

export async function getDenialEmail(
    firstName: string | null,
    appUrl: string,
    customTemplate?: { subject?: string | null; html?: string | null }
) {
    const defaultEmail = getDefaultDenialEmail(firstName, appUrl);
    
    // Use custom template if provided, otherwise use default
    const subject = customTemplate?.subject || defaultEmail.subject;
    let html = customTemplate?.html || defaultEmail.html;
    
    // Replace placeholders in custom template
    if (customTemplate?.html) {
        html = html
            .replace(/\{\{firstName\}\}/g, firstName || '')
            .replace(/\{\{greeting\}\}/g, firstName ? `Hi ${firstName},` : 'Hello,')
            .replace(/\{\{appUrl\}\}/g, appUrl);
    }
    
    return { subject, html };
}

/**
 * Criteria Nudge Email Template
 * Groups criteria by release, sorted by closest future release first
 */
export function getCriteriaNudgeEmail(
    recipientName: string | null,
    releaseGroups: Array<{
        release_name: string | null;
        release_date: string | null;
        epic_groups: Array<{
            epic_id: string;
            epic_name: string;
            criteria: Array<{
                id: string;
                label: string;
                category: string;
                due_date: string | null;
                status: string;
                nudge_type: string;
            }>;
        }>;
    }>,
    totalCriteriaCount: number,
    appUrl: string,
    orgTimeZone = 'America/New_York'
) {
    const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,';
    const todayYmd = getCalendarDateStringInTimeZone(orgTimeZone);
    const toYmd = (d: string | null | undefined) => (typeof d === 'string' ? d.trim().split('T')[0] : '') || '';

    // Calculate summary
    let overdueCount = 0;
    let dueTodayCount = 0;
    let dueSoonCount = 0;

    for (const rg of releaseGroups) {
        for (const eg of rg.epic_groups) {
            for (const c of eg.criteria) {
                const daysDiff = diffCalendarDaysBetweenYmd(c.due_date, todayYmd);
                if (daysDiff == null) continue;
                if (daysDiff < 0) overdueCount++;
                else if (daysDiff === 0) dueTodayCount++;
                else if (daysDiff <= 7) dueSoonCount++;
            }
        }
    }

    const summaryParts: string[] = [];
    if (overdueCount > 0) summaryParts.push(`<strong>${overdueCount} overdue</strong>`);
    if (dueTodayCount > 0) summaryParts.push(`<strong>${dueTodayCount} due today</strong>`);
    if (dueSoonCount > 0) summaryParts.push(`<strong>${dueSoonCount} due soon</strong>`);

    // Build release sections
    let releaseSectionsHtml = '';
    for (const releaseGroup of releaseGroups) {
        let releaseHeader = '';
        if (releaseGroup.release_name) {
            releaseHeader = `<h3 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-top: 24px; margin-bottom: 12px; font-size: 18px;">Release ${releaseGroup.release_name}`;
            if (releaseGroup.release_date) {
                const daysDiff = diffCalendarDaysBetweenYmd(releaseGroup.release_date, todayYmd);
                if (daysDiff != null) {
                    if (daysDiff < 0) {
                        releaseHeader += ` <span style="color: #6b7280; font-size: 14px; font-weight: normal;">(${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} ago)</span>`;
                    } else if (daysDiff === 0) {
                        releaseHeader += ` <span style="color: #6b7280; font-size: 14px; font-weight: normal;">(Today)</span>`;
                    } else {
                        releaseHeader += ` <span style="color: #6b7280; font-size: 14px; font-weight: normal;">(in ${daysDiff} day${daysDiff !== 1 ? 's' : ''})</span>`;
                    }
                }
            }
            releaseHeader += '</h3>';
        } else {
            releaseHeader = '<h3 style="font-family: \'Atkinson Hyperlegible\', sans-serif; color: #1f2937; margin-top: 24px; margin-bottom: 12px; font-size: 18px;">No Release Assigned</h3>';
        }

        releaseSectionsHtml += releaseHeader;

        for (const epicGroup of releaseGroup.epic_groups) {
            const sortedCriteria = [...epicGroup.criteria].sort((a, b) =>
                toYmd(a.due_date).localeCompare(toYmd(b.due_date))
            );

            const mostUrgent = sortedCriteria[0];
            let urgencyText = '';
            const epicDaysDiff = diffCalendarDaysBetweenYmd(mostUrgent?.due_date, todayYmd);
            if (epicDaysDiff != null) {
                if (epicDaysDiff < 0) {
                    urgencyText = ` <span style="color: #dc2626; font-size: 13px;">(${Math.abs(epicDaysDiff)} day${Math.abs(epicDaysDiff) !== 1 ? 's' : ''} overdue)</span>`;
                } else if (epicDaysDiff === 0) {
                    urgencyText = ' <span style="color: #f59e0b; font-size: 13px;">(Due today)</span>';
                } else if (epicDaysDiff <= 7) {
                    urgencyText = ` <span style="color: #f59e0b; font-size: 13px;">(Due in ${epicDaysDiff} day${epicDaysDiff !== 1 ? 's' : ''})</span>`;
                }
            }

            const epicUrl = `${appUrl}/epics/${epicGroup.epic_id}`;
            const criteriaList = sortedCriteria.map((c) => {
                let dueText = '';
                const daysDiff = diffCalendarDaysBetweenYmd(c.due_date, todayYmd);
                if (daysDiff != null) {
                    if (daysDiff < 0) {
                        dueText = ` <span style="color: #dc2626;">(${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} overdue)</span>`;
                    } else if (daysDiff === 0) {
                        dueText = ' <span style="color: #f59e0b;">(Due today)</span>';
                    } else if (daysDiff <= 7) {
                        dueText = ` <span style="color: #f59e0b;">(Due in ${daysDiff} day${daysDiff !== 1 ? 's' : ''})</span>`;
                    }
                }
                return `<li style="margin-bottom: 8px; line-height: 1.6;">${c.label}${dueText}</li>`;
            }).join('');

            releaseSectionsHtml += `
                <div style="margin-left: 20px; margin-bottom: 16px;">
                    <h4 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #374151; margin-bottom: 8px; font-size: 16px;">
                        <a href="${epicUrl}" style="color: #4f46e5; text-decoration: none;">${epicGroup.epic_name}</a>${urgencyText}
                    </h4>
                    <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                        ${criteriaList}
                    </ul>
                </div>
            `;
        }
    }

    const subject = overdueCount > 0
        ? `[ClearGO] ${totalCriteriaCount} Overdue Criteria Need Your Attention`
        : dueTodayCount > 0
        ? `[ClearGO] ${totalCriteriaCount} Criteria Due Today`
        : `[ClearGO] ${totalCriteriaCount} Criteria Need Your Attention`;

    const html = `
        <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">${greeting}</h2>
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                You have <strong>${totalCriteriaCount} criteria</strong> that need your attention.
            </p>
            
            ${summaryParts.length > 0 ? `
            <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="color: #374151; font-weight: 600; margin-bottom: 8px; font-size: 15px;">Summary</p>
                <p style="color: #4b5563; line-height: 1.6; margin: 0;">${summaryParts.join(', ')}</p>
            </div>
            ` : ''}

            ${releaseSectionsHtml}

            <div style="text-align: center; margin: 30px 0;">
                <a href="${appUrl}/my-items" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                    View All My Items
                </a>
            </div>

            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                This is an automated reminder. Please update the status of these criteria in ClearGO.
            </p>
        </div>
    `;

    return { subject, html };
}

export function getGateSignoffReadyEmail(params: {
    recipientName: string;
    epicName: string;
    epicId: string;
    categoryLabel: string;
    gateCriterionLabel: string;
    completedCount: number;
    appBaseUrl?: string;
}) {
    const {
        recipientName,
        epicName,
        epicId,
        categoryLabel,
        gateCriterionLabel,
        completedCount,
        appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.cleargo.io',
    } = params;

    const epicUrl = `${appBaseUrl}/epics/${epicId}`;
    const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,';

    const subject = `[ClearGO] Your Go/No-Go decision is needed — ${epicName}`;

    const html = `
        <div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px;">
                <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #4f46e5;">ClearGO · Launch Readiness</span>
            </div>

            <h2 style="font-family: serif; color: #111827; font-size: 22px; font-weight: 700; margin: 0 0 8px;">${greeting}</h2>

            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                All <strong>${completedCount} ${completedCount === 1 ? 'criterion' : 'criteria'}</strong> in the
                <strong>${categoryLabel}</strong> section of <strong>${epicName}</strong> have been completed.
            </p>

            <div style="background-color: #eef2ff; border-left: 4px solid #4f46e5; border-radius: 4px; padding: 16px; margin: 0 0 24px;">
                <p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4f46e5;">Your decision is needed</p>
                <p style="margin: 0; color: #1e1b4b; font-size: 15px; font-weight: 600;">${gateCriterionLabel}</p>
            </div>

            <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
                Please review the criteria and submit your <strong>Go / No-Go / Conditional</strong> decision so the team can proceed.
            </p>

            <div style="text-align: center; margin: 0 0 32px;">
                <a href="${epicUrl}"
                   style="display: inline-block; background-color: #4f46e5; color: white; padding: 13px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                    Review &amp; Give Decision
                </a>
            </div>

            <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; border-top: 1px solid #f3f4f6; padding-top: 16px; margin: 0;">
                You received this because you are the decision owner for the <em>${categoryLabel}</em> gate on <em>${epicName}</em>.
                Manage your notification preferences in
                <a href="${appBaseUrl}/settings" style="color: #4f46e5; text-decoration: none;">My Settings</a>.
            </p>
        </div>
    `;

    return { subject, html };
}
