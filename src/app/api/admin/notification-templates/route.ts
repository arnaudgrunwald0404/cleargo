import { NextRequest, NextResponse } from 'next/server';
import {
  buildStaleCriterionMessage,
  buildLaunchRiskAlertMessage,
  buildGoNoGoDecisionMessage,
  buildLeadershipDigestMessage,
  buildLaunchStatusChangeMessage,
  buildDelegationMessage,
  buildCriterionCommentOrAttachmentMessage,
  buildCriteriaAssignmentMessage,
  buildCriteriaNudgeMessage,
} from '@/lib/slack/templates';
import { buildRetroReminderMessage } from '@/lib/slack/templates/retro-reminders';
import { buildScorecardAlertMessage } from '@/lib/slack/templates/scorecard-alerts';
import { buildGtmAccessNudgeMessage } from '@/lib/slack/templates/gtm-access-nudges';
import { getSlackTheme } from '@/lib/slack/theme';
import {
  getLaunchStatusChangeEmail,
  getRiskAlertEmail,
  getCriteriaNudgeEmail,
} from '@/lib/email/templates';

// Mock data generators
const mockEpicId = '550e8400-e29b-41d4-a716-446655440000';
const mockCriterionId = '660e8400-e29b-41d4-a716-446655440001';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';

function renderSlackBlocks(blocks: any[]): string {
  let html = '<div style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff;">';
  
  function renderMarkdown(text: string): string {
    // Handle Slack markdown links: <url|text>
    text = text.replace(/<([^|>]+)\|([^>]+)>/g, '<a href="$1" style="color: #4f46e5; text-decoration: none;">$2</a>');
    // Handle bold
    text = text.replace(/\*(.+?)\*/g, '<strong>$1</strong>');
    // Handle italic
    text = text.replace(/_(.+?)_/g, '<em>$1</em>');
    // Handle line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
  }
  
  for (const block of blocks) {
    if (block.type === 'header') {
      const text = block.text?.text || '';
      html += `<div style="background: #4f46e5; color: white; padding: 16px; font-weight: 600; font-size: 18px;">${text}</div>`;
    } else if (block.type === 'section') {
      html += '<div style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">';
      if (block.text?.text) {
        html += `<div style="color: #1d1d1d; line-height: 1.5;">${renderMarkdown(block.text.text)}</div>`;
      }
      if (block.fields) {
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">';
        for (const field of block.fields) {
          html += `<div style="font-size: 14px; color: #666;">${renderMarkdown(field.text)}</div>`;
        }
        html += '</div>';
      }
      html += '</div>';
    } else if (block.type === 'context') {
      html += '<div style="padding: 8px 16px; background: #f9fafb; font-size: 13px; color: #666; border-bottom: 1px solid #f0f0f0;">';
      if (block.elements) {
        for (const el of block.elements) {
          html += `<div>${renderMarkdown(el.text)}</div>`;
        }
      }
      html += '</div>';
    } else if (block.type === 'divider') {
      html += '<div style="height: 1px; background: #e5e7eb; margin: 8px 0;"></div>';
    } else if (block.type === 'actions') {
      html += '<div style="padding: 12px 16px; border-top: 1px solid #f0f0f0;">';
      if (block.elements) {
        for (const el of block.elements) {
          if (el.type === 'button') {
            const style = el.style === 'primary' ? 'background: #4f46e5; color: white;' : 'background: #f3f4f6; color: #1d1d1d;';
            html += `<a href="${el.url || '#'}" style="display: inline-block; padding: 8px 16px; border-radius: 4px; text-decoration: none; margin-right: 8px; font-size: 14px; font-weight: 500; ${style}">${el.text?.text || ''}</a>`;
          }
        }
      }
      html += '</div>';
    }
  }
  
  html += '</div>';
  return html;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const channel = searchParams.get('channel') as 'slack' | 'email';

    if (!type || !channel) {
      return NextResponse.json(
        { error: 'Missing type or channel parameter' },
        { status: 400 }
      );
    }

    const theme = await getSlackTheme();

    try {
      let preview: string;
      let subject: string | null = null;

      if (channel === 'slack') {
        let message: { text: string; blocks: any[] };

        switch (type) {
          case 'stale_criterion':
            message = buildStaleCriterionMessage(
              {
                launch_name: 'Q2 Product Launch',
                launch_id: mockEpicId,
                criterion_label: 'Security Review Complete',
                criterion_id: mockCriterionId,
                days_stale: 14,
                last_updated: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                decision_owner_name: 'Sarah Chen',
                ai_personalized_nudge: 'This security review is critical for launch readiness. Consider updating the status to reflect current security posture.',
              },
              theme
            );
            break;

          case 'launch_risk_alert':
            message = buildLaunchRiskAlertMessage(
              {
                launch_name: 'Mobile App Release v2.0',
                launch_id: mockEpicId,
                tier: 'TIER_1',
                risk_level: 'High',
                readiness_score: 0.65,
                days_to_launch: 7,
                gate_blockers: 3,
                owner_name: 'Michael Rodriguez',
              },
              theme
            );
            break;

          case 'go_no_go_decision':
            message = buildGoNoGoDecisionMessage(
              {
                launch_name: 'Enterprise Feature Rollout',
                launch_id: mockEpicId,
                verdict: 'Conditional Go',
                decision_date: new Date().toLocaleDateString(),
                notes: 'Approved with conditions: 1) Complete security audit, 2) Final QA sign-off, 3) Customer success training completed.',
                conditions_count: 3,
                decided_by: 'Alex Thompson',
              },
              theme
            );
            break;

          case 'weekly_digest':
            message = buildLeadershipDigestMessage(
              {
                week_of: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                narrative: 'This week shows strong progress on upcoming releases with some areas requiring attention.',
                last_releases: [
                  {
                    release_name: 'Spring Release 2024',
                    launch_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    average_readiness: 85,
                    metrics_count: 12,
                    red_flags: { no_metrics: false, no_progression: false },
                    high_risk_epics: [
                      { name: 'Payment Integration', id: mockEpicId, tier: 'TIER_1', risk_level: 'MEDIUM', readiness: 75 },
                    ],
                  },
                ],
                next_releases: [
                  {
                    release_name: 'Summer Release 2024',
                    launch_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
                    readiness_status: 'CONDITIONAL_GO',
                    readiness_breakdown: { go: 5, conditional_go: 2, no_go: 1, not_evaluated: 0 },
                    total_criteria_overdue: 3,
                    gate_red_count: 1,
                    gate_yellow_count: 2,
                    high_risk_epics: [
                      { name: 'API Migration', id: mockEpicId, tier: 'TIER_1', risk_level: 'HIGH', readiness: 60, target_launch_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString() },
                    ],
                    red_flags: [
                      {
                        epic_name: 'API Migration',
                        epic_id: mockEpicId,
                        gate_blockers: 2,
                        overdue_criteria: 5,
                        readiness_score: 0.6,
                        risk_level: 'HIGH',
                      },
                    ],
                  },
                ],
              },
              theme
            );
            break;

          case 'launch_status_change':
            message = buildLaunchStatusChangeMessage(
              {
                launch_name: 'Platform Upgrade',
                launch_id: mockEpicId,
                old_status: 'GO',
                new_status: 'CONDITIONAL_GO',
                changed_by: 'Emma Wilson',
                reason: 'New security vulnerability identified requiring remediation',
              },
              theme
            );
            break;

          case 'delegation':
            message = buildDelegationMessage(
              {
                epic_name: 'Customer Portal Enhancement',
                epic_id: mockEpicId,
                task_label: 'Security Review Complete',
                category: 'Security',
                delegation_type: 'CATEGORY_EXCLUDING_GATES',
                delegated_by: 'David Kim',
                epic_url: `${APP_URL}/epics/${mockEpicId}`,
              },
              theme
            );
            break;

          case 'criteria_assignment':
            message = buildCriteriaAssignmentMessage(
              {
                epic_id: mockEpicId,
                epic_name: 'New Dashboard Feature',
                assignee_id: 'user-123',
                assignee_email: 'jordan.martinez@example.com',
                assignee_name: 'Jordan Martinez',
                assignee_slack_handle: 'U123456',
                criteria: [
                  { id: '1', criterion_id: 'criterion-1', label: 'Performance Testing Complete', category: 'QUALITY_ASSURANCE', due_date: null, status: 'NOT_SET' },
                  { id: '2', criterion_id: 'criterion-2', label: 'Accessibility Review', category: 'COMPLIANCE', due_date: null, status: 'NOT_SET' },
                  { id: '3', criterion_id: 'criterion-3', label: 'Documentation Updated', category: 'DOCUMENTATION', due_date: null, status: 'NOT_SET' },
                ],
              },
              theme
            );
            break;

          case 'gtm_access_nudge':
            message = buildGtmAccessNudgeMessage([
              {
                epicId: mockEpicId,
                epicName: 'Analytics Platform Launch',
                plannedGtmYmd: '2026-06-01',
                daysSincePlanned: 4,
                ownerEmail: 'pm@clearcompany.com',
                actualGtmAccessDate: null,
              },
              {
                epicId: '660e8400-e29b-41d4-a716-446655440002',
                epicName: 'E-commerce Integration',
                plannedGtmYmd: '2026-05-28',
                daysSincePlanned: 8,
                ownerEmail: 'pm@clearcompany.com',
                actualGtmAccessDate: null,
              },
            ]);
            break;

          case 'retro_reminder':
            message = buildRetroReminderMessage(
              {
                id: mockEpicId,
                name: 'Analytics Platform Launch',
                target_launch_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              },
              30,
              30
            );
            break;

          case 'scorecard_alert':
            message = buildScorecardAlertMessage(
              {
                id: mockEpicId,
                name: 'E-commerce Integration',
                target_launch_date: new Date().toISOString(),
              },
              {
                id: 'scorecard-1',
                epic_id: mockEpicId,
                snapshot_date: new Date().toISOString(),
                overall_status: 'AT_RISK',
                metric_results: [
                  { metricId: 'm1', metricName: 'User Adoption', actual: 45, expected: 60, status: 'MISSED', source: 'PENDO' },
                  { metricId: 'm2', metricName: 'Feature Usage', actual: 55, expected: 60, status: 'AT_RISK', source: 'PENDO' },
                ],
                created_at: new Date().toISOString(),
              },
              'AT_RISK'
            );
            break;

          case 'criteria_nudge':
            message = buildCriteriaNudgeMessage(
              {
                epic_id: mockEpicId,
                epic_name: 'Mobile App Update',
                assignee_id: 'user-456',
                assignee_email: 'taylor.brown@example.com',
                assignee_name: 'Taylor Brown',
                assignee_slack_handle: 'U789012',
                criteria: [
                  { id: '1', label: 'User Acceptance Testing', category: 'QUALITY_ASSURANCE', due_date: new Date().toISOString() },
                  { id: '2', label: 'App Store Submission', category: 'RELEASE', due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
                ],
              },
              '1_week_before',
              theme
            );
            break;

          case 'criterion_comment_or_attachment':
            message = buildCriterionCommentOrAttachmentMessage(
              {
                epic_name: 'Cloud Migration Project',
                epic_id: mockEpicId,
                criterion_label: 'Infrastructure Setup Complete',
                criterion_status_id: mockCriterionId,
                added_by_name: 'Chris Anderson',
                has_comment: true,
                has_attachment: true,
              },
              theme
            );
            break;

          default:
            return NextResponse.json(
              { error: `Template not implemented for ${type} on ${channel}` },
              { status: 404 }
            );
        }

        preview = renderSlackBlocks(message.blocks);
        subject = message.text;
      } else {
        // Email templates
        let emailContent: { subject: string; html: string };

        switch (type) {
          case 'launch_status_change':
            emailContent = getLaunchStatusChangeEmail(
              'Platform Upgrade',
              'GO',
              'CONDITIONAL_GO',
              `${APP_URL}/epics/${mockEpicId}`
            );
            break;

          case 'launch_risk_alert':
            emailContent = getRiskAlertEmail(
              'Mobile App Release v2.0',
              'High',
              'Multiple gate blockers identified with only 7 days until launch',
              `${APP_URL}/epics/${mockEpicId}`
            );
            break;

          case 'criteria_nudge':
            emailContent = getCriteriaNudgeEmail(
              'Jordan Martinez',
              [
                {
                  release_name: 'Q2 Release',
                  release_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                  epic_groups: [
                    {
                      epic_id: mockEpicId,
                      epic_name: 'New Dashboard Feature',
                      criteria: [
                        { id: '1', label: 'Performance Testing Complete', category: 'QUALITY_ASSURANCE', due_date: new Date().toISOString(), status: 'NOT_SET', nudge_type: '1_week_before' },
                        { id: '2', label: 'Accessibility Review', category: 'COMPLIANCE', due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), status: 'NOT_SET', nudge_type: '1_week_before' },
                      ],
                    },
                  ],
                },
              ],
              2,
              APP_URL
            );
            break;

          default:
            return NextResponse.json(
              { error: `Template not implemented for ${type} on ${channel}` },
              { status: 404 }
            );
        }

        preview = emailContent.html;
        subject = emailContent.subject;
      }

      return NextResponse.json({
        type,
        channel,
        preview,
        subject,
        implemented: true,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Failed to generate preview: ${error.message}`,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
