/**
 * Test endpoint for Slack notifications
 * Allows manual triggering of notifications for testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendSlackNotification } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, testData } = body;

    if (!type) {
      return NextResponse.json({ error: 'Missing notification type' }, { status: 400 });
    }

    // Test data for different notification types
    const testPayloads: Record<string, any> = {
      stale_criterion: {
        type: 'stale_criterion',
        priority: 'medium',
        metadata: {
          launch_name: 'Test Launch - Q1 Product Release',
          launch_id: 'test-launch-id',
          criterion_label: 'Security Review Complete',
          criterion_id: 'test-criterion-id',
          days_stale: 21,
          last_updated: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
          decision_owner_name: 'Test User',
        },
      },
      launch_risk_alert: {
        type: 'launch_risk_alert',
        priority: 'high',
        metadata: {
          launch_name: 'Test Launch - Q1 Product Release',
          launch_id: 'test-launch-id',
          tier: 'TIER_1',
          risk_level: 'HIGH',
          readiness_score: 0.65,
          days_to_launch: 7,
          gate_blockers: 2,
          owner_name: 'Test Owner',
        },
      },
      launch_status_change: {
        type: 'launch_status_change',
        priority: 'high',
        metadata: {
          launch_name: 'Test Launch - Q1 Product Release',
          launch_id: 'test-launch-id',
          old_status: 'GO',
          new_status: 'CONDITIONAL_GO',
          changed_by: 'Test User',
          reason: 'New blocker identified in security review',
        },
      },
      leadership_digest: {
        type: 'leadership_digest',
        priority: 'low',
        metadata: {
          week_of: new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          high_risk_launches: [
            {
              name: 'Q1 Product Release',
              id: 'test-1',
              tier: 'TIER_1',
              risk: 'HIGH',
              days_to_launch: 7,
              readiness: 65,
            },
            {
              name: 'Mobile App Update',
              id: 'test-2',
              tier: 'TIER_2',
              risk: 'MEDIUM',
              days_to_launch: 14,
              readiness: 75,
            },
          ],
          upcoming_launches: [
            {
              name: 'API v2 Launch',
              id: 'test-3',
              tier: 'TIER_1',
              target_release_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
          total_active: 12,
        },
      },
    };

    const payload = testData || testPayloads[type];

    if (!payload) {
      return NextResponse.json({ error: `Unknown notification type: ${type}` }, { status: 400 });
    }

    await sendSlackNotification(payload);

    return NextResponse.json({
      success: true,
      message: `Test notification sent: ${type}`,
      payload,
    });
  } catch (error: any) {
    console.error('Test notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send test notification', details: error.message },
      { status: 500 }
    );
  }
}
