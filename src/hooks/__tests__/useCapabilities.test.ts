/**
 * The hook must fail CLOSED. A control that appears and then rejects every save
 * is the bug this whole change exists to remove, so "we do not know yet" has to
 * render the same as "no".
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useCapabilities, invalidateCapabilities } from '../useCapabilities';

const originalFetch = global.fetch;

function mockMe(body: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
        ok,
        status,
        json: async () => body,
    }) as unknown as typeof fetch;
}

beforeEach(() => {
    invalidateCapabilities();
    jest.restoreAllMocks();
});

afterAll(() => {
    global.fetch = originalFetch;
});

describe('useCapabilities', () => {
    it('reports the capabilities /api/me returned', async () => {
        mockMe({ capabilities: ['launches.manage', 'criteria.status.update'] });

        const { result } = renderHook(() => useCapabilities());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.can('launches.manage')).toBe(true);
        expect(result.current.can('criteria.status.update')).toBe(true);
        expect(result.current.can('launch.status.update')).toBe(false);
    });

    it('is closed while still loading', () => {
        mockMe({ capabilities: ['launches.manage'] });

        const { result } = renderHook(() => useCapabilities());

        // First render, before the fetch resolves.
        expect(result.current.loading).toBe(true);
        expect(result.current.can('launches.manage')).toBe(false);
    });

    it('is closed when /api/me fails', async () => {
        mockMe({}, false, 500);

        const { result } = renderHook(() => useCapabilities());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toContain('500');
        expect(result.current.can('launches.manage')).toBe(false);
    });

    it('is closed when the response has no capabilities field', async () => {
        // An older deploy, or a shape change: absence must not read as "allowed".
        mockMe({ user: { email: 'pm@clearcompany.com' } });

        const { result } = renderHook(() => useCapabilities());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.can('launches.manage')).toBe(false);
    });

    it('fetches once for several consumers on a page', async () => {
        mockMe({ capabilities: ['launches.manage'] });

        const a = renderHook(() => useCapabilities());
        const b = renderHook(() => useCapabilities());
        await waitFor(() => expect(a.result.current.loading).toBe(false));
        await waitFor(() => expect(b.result.current.loading).toBe(false));

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('refetches after invalidation, so impersonation and rule edits take effect', async () => {
        mockMe({ capabilities: ['launches.manage'] });
        const first = renderHook(() => useCapabilities());
        await waitFor(() => expect(first.result.current.loading).toBe(false));
        expect(first.result.current.can('launches.manage')).toBe(true);

        invalidateCapabilities();
        mockMe({ capabilities: [] });

        const second = renderHook(() => useCapabilities());
        await waitFor(() => expect(second.result.current.loading).toBe(false));
        expect(second.result.current.can('launches.manage')).toBe(false);
    });
});
