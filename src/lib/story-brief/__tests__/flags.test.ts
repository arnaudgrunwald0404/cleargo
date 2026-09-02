import {
  normalizeClaim,
  storyBriefFlagKey,
  reconcileFlags,
  pendingFlags,
  flagsClearedForRatification,
} from '../flags';

describe('normalizeClaim', () => {
  it('ignores case, edge punctuation and whitespace runs', () => {
    expect(normalizeClaim('  "No pricing decided yet."  ')).toBe('no pricing decided yet');
    expect(normalizeClaim('No   pricing    decided yet')).toBe('no pricing decided yet');
    expect(normalizeClaim('NO PRICING DECIDED YET')).toBe('no pricing decided yet');
  });

  it('keeps genuinely different claims distinct', () => {
    expect(normalizeClaim('pricing is undecided')).not.toBe(normalizeClaim('naming is undecided'));
  });
});

describe('storyBriefFlagKey', () => {
  it('is stable across trivial rewording', () => {
    // The generator re-emits the same gap with different punctuation and casing
    // on each run; that must not mint a new flag.
    const a = storyBriefFlagKey('why_we_prioritized_it', 'No customer evidence cited.');
    const b = storyBriefFlagKey('why_we_prioritized_it', '  no customer evidence cited  ');
    expect(a).toBe(b);
  });

  it('separates the same claim raised in different sections', () => {
    expect(storyBriefFlagKey('value_story', 'Pricing undecided')).not.toBe(
      storyBriefFlagKey('open_decisions', 'Pricing undecided')
    );
  });

  it('separates different claims in the same section', () => {
    expect(storyBriefFlagKey('value_story', 'Pricing undecided')).not.toBe(
      storyBriefFlagKey('value_story', 'Naming undecided')
    );
  });

  it('is a fixed-width hex key', () => {
    expect(storyBriefFlagKey('s', 'c')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('reconcileFlags', () => {
  const flag = (section: string, claim: string) => ({ section, claim });

  it('inserts genuinely new gaps', () => {
    const r = reconcileFlags([flag('value_story', 'No ROI evidence')], [], 1);
    expect(r.toInsert).toHaveLength(1);
    expect(r.toInsert[0].section).toBe('value_story');
    expect(r.toTouch).toHaveLength(0);
  });

  it('touches rather than re-inserts a gap already on record', () => {
    const key = storyBriefFlagKey('value_story', 'No ROI evidence');
    const r = reconcileFlags(
      [flag('value_story', 'No ROI evidence')],
      [{ flag_key: key, status: 'open' }],
      2
    );
    expect(r.toInsert).toHaveLength(0);
    expect(r.toTouch).toEqual([{ flag_key: key, last_seen_generation: 2 }]);
  });

  it('never reopens an answered flag', () => {
    // This is the whole point: without it, every regeneration restarts the
    // interview and the PM is asked the same question forever.
    const key = storyBriefFlagKey('open_decisions', 'Pricing undecided');
    const r = reconcileFlags(
      [flag('open_decisions', 'Pricing undecided')],
      [{ flag_key: key, status: 'answered' }],
      3
    );
    expect(r.toInsert).toHaveLength(0);
    expect(r.reappeared).toEqual([key]);
  });

  it('treats a deferred flag as settled too', () => {
    const key = storyBriefFlagKey('open_decisions', 'Beta scope unclear');
    const r = reconcileFlags(
      [flag('open_decisions', 'Beta scope unclear')],
      [{ flag_key: key, status: 'deferred' }],
      2
    );
    expect(r.reappeared).toEqual([key]);
  });

  it('marks vanished flags stale rather than deleting them', () => {
    const gone = storyBriefFlagKey('value_story', 'No ROI evidence');
    const r = reconcileFlags([flag('value_story', 'Different gap')], [{ flag_key: gone, status: 'answered' }], 2);
    expect(r.stale).toEqual([gone]);
  });

  it('collapses the same gap emitted twice in one generation', () => {
    // A section's own open_flags plus postProcessGrounding's append can both
    // carry the same claim.
    const r = reconcileFlags(
      [flag('value_story', 'No ROI evidence'), flag('value_story', 'no roi evidence.')],
      [],
      1
    );
    expect(r.toInsert).toHaveLength(1);
  });

  it('ignores blank claims', () => {
    const r = reconcileFlags([flag('value_story', '   '), flag('value_story', '')], [], 1);
    expect(r.toInsert).toHaveLength(0);
  });
});

describe('pendingFlags', () => {
  it('is the ask queue: open and asked only', () => {
    const flags = [
      { status: 'open' as const },
      { status: 'asked' as const },
      { status: 'answered' as const },
      { status: 'deferred' as const },
    ];
    expect(pendingFlags(flags)).toHaveLength(2);
  });
});

describe('flagsClearedForRatification', () => {
  it('requires every flag answered or explicitly deferred', () => {
    expect(flagsClearedForRatification([{ status: 'answered' }, { status: 'deferred' }])).toBe(true);
    expect(flagsClearedForRatification([{ status: 'answered' }, { status: 'open' }])).toBe(false);
    expect(flagsClearedForRatification([{ status: 'asked' }])).toBe(false);
  });

  it('is vacuously true with no flags', () => {
    expect(flagsClearedForRatification([])).toBe(true);
  });
});
