import { resolveEpicPmEmail } from '@/lib/services/gtmAccessNudgeService';

describe('resolveEpicPmEmail', () => {
  const podMapping = { 'Platform Pod': 'pod.pm@clearcompany.com' };

  it('prefers pod mapping over owner_email', () => {
    const email = resolveEpicPmEmail(
      { owner_email: 'owner@clearcompany.com', pod: 'Platform Pod', aha_fields: null },
      podMapping
    );
    expect(email).toBe('pod.pm@clearcompany.com');
  });

  it('falls back to owner_email', () => {
    const email = resolveEpicPmEmail(
      { owner_email: 'owner@clearcompany.com', pod: null, aha_fields: null },
      podMapping
    );
    expect(email).toBe('owner@clearcompany.com');
  });

  it('falls back to Aha assigned_to_user email', () => {
    const email = resolveEpicPmEmail(
      {
        owner_email: null,
        pod: null,
        aha_fields: { standard_fields: { assigned_to_user: { email: 'aha.pm@clearcompany.com' } } },
      },
      podMapping
    );
    expect(email).toBe('aha.pm@clearcompany.com');
  });
});
