/**
 * The five team-management tools, as registry entries.
 *
 * These were registered inline in server.ts, which was fine while the MCP route
 * was their only consumer. It is not any more: the in-app ClearGO agent reads
 * the same registry, so a tool that is not in the table is a tool the assistant
 * cannot reach. One table, two transports.
 *
 * Names stay snake_case. They are the older convention and the rest of the table
 * is kebab-case, but renaming them would break the Team Tactical Sync client and
 * anyone whose Claude Desktop history refers to them. Consistency is not worth a
 * silent breakage.
 *
 * Each handler catches and returns `{ error: message }` rather than throwing.
 * The registry wrapper generalises a throw to "Internal server error", and these
 * tools have genuinely useful failures ("Person not found") that the caller
 * should see.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import {
    queryTeamMembers,
    queryOneOnOnePrep,
    queryMemberEpics,
    queryMemberBlockers,
    queryEpicDetail,
} from '../queries';

function failed(err: unknown): { error: string } {
    return { error: err instanceof Error ? err.message : 'Internal server error' };
}

export async function listTeamMembers(
    supabase: SupabaseClient,
    _args: Record<string, unknown>,
    actor: McpAuthInfo
): Promise<unknown> {
    try {
        return { data: await queryTeamMembers(supabase, actor.email) };
    } catch (err) {
        return failed(err);
    }
}

export const PersonSchema = z.object({
    person_id: z.string().uuid().describe('app_user UUID of the team member'),
});

export async function getOneOnOnePrep(
    supabase: SupabaseClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const parsed = PersonSchema.safeParse(args);
    if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

    try {
        return await queryOneOnOnePrep(supabase, parsed.data.person_id);
    } catch (err) {
        return failed(err);
    }
}

export const MemberEpicsSchema = z.object({
    member_id: z.string().uuid().describe('app_user UUID of the team member'),
    status: z
        .string()
        .optional()
        .describe('PLANNED, IN_PROGRESS, LAUNCHED, CANCELLED, ARCHIVED or COMPLETED'),
});

export async function listMemberEpics(
    supabase: SupabaseClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const parsed = MemberEpicsSchema.safeParse(args);
    if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

    try {
        return await queryMemberEpics(supabase, parsed.data.member_id, parsed.data.status);
    } catch (err) {
        return failed(err);
    }
}

export const MemberSchema = z.object({
    member_id: z.string().uuid().describe('app_user UUID of the team member'),
});

export async function listMemberBlockers(
    supabase: SupabaseClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const parsed = MemberSchema.safeParse(args);
    if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

    try {
        return await queryMemberBlockers(supabase, parsed.data.member_id);
    } catch (err) {
        return failed(err);
    }
}

export const EpicDetailSchema = z.object({
    epic_id: z.string().uuid().describe('Epic UUID'),
});

export async function getEpicDetail(
    supabase: SupabaseClient,
    args: Record<string, unknown>
): Promise<unknown> {
    const parsed = EpicDetailSchema.safeParse(args);
    if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

    try {
        return await queryEpicDetail(supabase, parsed.data.epic_id);
    } catch (err) {
        return failed(err);
    }
}
