/**
 * Slack's error detail must survive into the log line.
 *
 * `data.error` alone is not actionable for anything carrying blocks or a view:
 * `invalid_arguments` does not say which block, and the answer lives in
 * `response_metadata.messages`, which the client used to drop. A failure that
 * reads "Slack API error: invalid_arguments" costs a debugging session.
 */
import { describe, it, expect } from '@jest/globals';
import { describeSlackError } from '../client';

describe('describeSlackError', () => {
    it('appends the response metadata Slack sends with block failures', () => {
        expect(
            describeSlackError({
                error: 'invalid_arguments',
                response_metadata: {
                    messages: ['[ERROR] failed to match all allowed schemas [json-pointer:/view]'],
                },
            })
        ).toBe(
            'invalid_arguments ([ERROR] failed to match all allowed schemas [json-pointer:/view])'
        );
    });

    it('joins several messages', () => {
        expect(
            describeSlackError({ error: 'invalid_blocks', response_metadata: { messages: ['a', 'b'] } })
        ).toBe('invalid_blocks (a; b)');
    });

    it('returns the bare code when there is no metadata', () => {
        expect(describeSlackError({ error: 'expired_trigger_id' })).toBe('expired_trigger_id');
    });

    it('does not add empty parentheses for an empty message list', () => {
        expect(
            describeSlackError({ error: 'channel_not_found', response_metadata: { messages: [] } })
        ).toBe('channel_not_found');
    });

    /** Slack can answer ok:false with no code at all; the log still needs words. */
    it('names an absent code', () => {
        expect(describeSlackError({})).toBe('unknown_error');
    });
});
