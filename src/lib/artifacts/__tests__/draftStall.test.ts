import { describe, it, expect } from '@jest/globals';
import {
    DRAFT_STALE_AFTER_MS,
    isDraftStalled,
    type ArtifactStatus,
} from '@/types/artifacts';

const NOW = Date.parse('2026-08-28T12:00:00.000Z');

function row(status: ArtifactStatus, updatedAt: string) {
    return { status, updated_at: updatedAt };
}

function agoMs(ms: number): string {
    return new Date(NOW - ms).toISOString();
}

describe('isDraftStalled', () => {
    it('is false for any status other than DRAFTING, however old', () => {
        const ancient = agoMs(DRAFT_STALE_AFTER_MS * 100);
        for (const status of [
            'NOT_STARTED',
            'PENDING_REVIEW',
            'CHANGES_REQUESTED',
            'APPROVED',
        ] as ArtifactStatus[]) {
            expect(isDraftStalled(row(status, ancient), NOW)).toBe(false);
        }
    });

    it('is false while the run could still be in flight', () => {
        expect(isDraftStalled(row('DRAFTING', agoMs(0)), NOW)).toBe(false);
        expect(isDraftStalled(row('DRAFTING', agoMs(30_000)), NOW)).toBe(false);
        expect(isDraftStalled(row('DRAFTING', agoMs(DRAFT_STALE_AFTER_MS - 1000)), NOW)).toBe(
            false
        );
    });

    /**
     * The window matches the Netlify background-function ceiling: past it the
     * worker cannot still be alive, so the row is abandoned rather than busy.
     */
    it('is true once the background function could no longer be running', () => {
        expect(isDraftStalled(row('DRAFTING', agoMs(DRAFT_STALE_AFTER_MS + 1000)), NOW)).toBe(
            true
        );
        expect(isDraftStalled(row('DRAFTING', agoMs(DRAFT_STALE_AFTER_MS * 4)), NOW)).toBe(true);
    });

    it('is exactly the 15 minute ceiling, not a rounded guess', () => {
        expect(DRAFT_STALE_AFTER_MS).toBe(15 * 60 * 1000);
    });

    /** Stranding the button forever is worse than an early retry. */
    it('treats an unparseable timestamp as stalled rather than busy', () => {
        expect(isDraftStalled(row('DRAFTING', 'not a date'), NOW)).toBe(true);
        expect(isDraftStalled(row('DRAFTING', ''), NOW)).toBe(true);
    });

    it('does not treat a future timestamp as stalled', () => {
        expect(isDraftStalled(row('DRAFTING', agoMs(-60_000)), NOW)).toBe(false);
    });
});
