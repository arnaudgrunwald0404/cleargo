import { NextRequest, NextResponse } from 'next/server';
import type { AhaWebhookPayload } from '@/lib/aha/types';
import { verifyWebhookSignature } from '@/lib/aha/webhook-validator';
import { mapEpicToLaunch, shouldProcessEpic } from '@/lib/aha/mapping';
import {
    upsertLaunchFromAha,
    getUserByEmail,
    getFallbackProductOpsUser,
    instantiateCriteriaForLaunch,
    getLaunchByAhaId,
} from '@/lib/db/launches';

export async function POST(req: NextRequest) {
    try {
        // Get raw body for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get('x-aha-signature') || req.headers.get('x-hub-signature-256');

        // Verify webhook signature
        const isValid = await verifyWebhookSignature(rawBody, signature);
        if (!isValid) {
            console.error('Invalid webhook signature');
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Parse payload
        const payload: AhaWebhookPayload = JSON.parse(rawBody);

        // Only process epic events
        if (!payload.epic) {
            return NextResponse.json({ message: 'Not an epic event, skipping' }, { status: 200 });
        }

        const epic = payload.epic;

        // Apply filter: only process if launch candidate or has LaunchConsole tag
        if (!shouldProcessEpic(epic)) {
            return NextResponse.json(
                { message: 'Epic does not match filter criteria, skipping' },
                { status: 200 }
            );
        }

        // Map Aha epic to launch data
        const launchData = mapEpicToLaunch(epic);

        // Resolve owner
        let ownerId: string | null = null;
        if (launchData.owner_email) {
            const user = await getUserByEmail(launchData.owner_email);
            if (user) {
                ownerId = user.id;
            } else {
                // Fallback to Product Ops user
                console.warn(`Owner not found: ${launchData.owner_email}, using fallback`);
                ownerId = await getFallbackProductOpsUser();
            }
        } else {
            // No owner specified, use fallback
            ownerId = await getFallbackProductOpsUser();
        }

        // Check if this is a new launch
        const existingLaunch = await getLaunchByAhaId(launchData.aha_id);
        const isNewLaunch = !existingLaunch;

        // Upsert launch
        const launch = await upsertLaunchFromAha(launchData, ownerId);

        // For new launches, instantiate criteria
        if (isNewLaunch) {
            await instantiateCriteriaForLaunch(launch.id, launch.tier);
        }

        return NextResponse.json({
            message: isNewLaunch ? 'Launch created' : 'Launch updated',
            launch_id: launch.id,
            aha_id: launch.aha_id,
        }, { status: 200 });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: (error as Error).message },
            { status: 500 }
        );
    }
}
