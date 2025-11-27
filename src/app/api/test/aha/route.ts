import { NextRequest, NextResponse } from 'next/server';
import { getAhaClient } from '@/lib/aha/client';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const epicId = searchParams.get('epicId');

    try {
        const client = getAhaClient();

        switch (action) {
            case 'products': {
                // List all products/workspaces
                const products = await client.getProducts();
                return NextResponse.json({
                    success: true,
                    action: 'products',
                    data: products,
                    count: products?.products?.length || 0
                });
            }

            case 'list': {
                // Fetch list of epics
                const product = searchParams.get('product');
                const epics = await client.getEpics({
                    per_page: 10,
                    product: product || undefined
                });
                return NextResponse.json({
                    success: true,
                    action: 'list',
                    data: epics,
                    count: epics?.epics?.length || 0,
                    product: product || 'all'
                });
            }

            case 'get': {
                if (!epicId) {
                    return NextResponse.json(
                        { success: false, error: 'epicId required for get action' },
                        { status: 400 }
                    );
                }
                const epic = await client.getEpic(epicId);
                return NextResponse.json({
                    success: true,
                    action: 'get',
                    data: epic
                });
            }

            case 'fields': {
                if (!epicId) {
                    return NextResponse.json(
                        { success: false, error: 'epicId required for fields action' },
                        { status: 400 }
                    );
                }
                const epic = await client.getEpic(epicId);
                return NextResponse.json({
                    success: true,
                    action: 'fields',
                    data: {
                        id: epic.id,
                        reference_num: epic.reference_num,
                        name: epic.name,
                        workflow_status: epic.workflow_status?.name,
                        assigned_to_user: epic.assigned_to_user?.email,
                        custom_fields: epic.custom_fields,
                        tags: epic.tags
                    }
                });
            }

            case 'test-connection': {
                // Simple connection test
                const result = await client.testConnection();
                return NextResponse.json({
                    success: true,
                    action: 'test-connection',
                    data: result
                });
            }

            default:
                return NextResponse.json(
                    { success: false, error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('Aha! API test error:', error);
        return NextResponse.json(
            {
                success: false,
                error: (error as Error).message,
                details: error
            },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { epicId, customFields } = body;

        if (!epicId || !customFields) {
            return NextResponse.json(
                { success: false, error: 'epicId and customFields required' },
                { status: 400 }
            );
        }

        const client = getAhaClient();
        const result = await client.updateEpicCustomFields(epicId, customFields);

        return NextResponse.json({
            success: true,
            action: 'write-back',
            data: result
        });
    } catch (error) {
        console.error('Aha! write-back test error:', error);
        return NextResponse.json(
            {
                success: false,
                error: (error as Error).message,
                details: error
            },
            { status: 500 }
        );
    }
}
