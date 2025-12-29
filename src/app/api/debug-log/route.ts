import { NextRequest, NextResponse } from 'next/server';
import { writeFile, appendFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const logPath = join(process.cwd(), '.cursor', 'debug.log');
        const logEntry = JSON.stringify(body) + '\n';
        
        try {
            await appendFile(logPath, logEntry, 'utf8');
        } catch (error: any) {
            // If file doesn't exist, create directory and file
            if (error.code === 'ENOENT') {
                const { mkdir } = await import('fs/promises');
                await mkdir(join(process.cwd(), '.cursor'), { recursive: true });
                await appendFile(logPath, logEntry, 'utf8');
            } else {
                throw error;
            }
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Debug log error:', error);
        return NextResponse.json({ error: 'Failed to write log' }, { status: 500 });
    }
}

