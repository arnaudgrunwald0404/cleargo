import {
  shapeComments,
  shapeTranscripts,
  renderHarvestForPrompt,
  isHarvestEmpty,
  MAX_COMMENTS,
  MAX_COMMENT_CHARS,
  MAX_TRANSCRIPTS,
} from '../harvest';

describe('shapeComments', () => {
  it('keeps a movement-only row even with no comment body', () => {
    // "moved 2026.8 -> 2026.9, cause: dependency slipped" is the single best
    // answer to "why did timing change" and lives nowhere else.
    const out = shapeComments([
      { comment_text: null, from_release: '2026.8', to_release: '2026.9', movement_cause: 'dependency slipped' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].movement_cause).toBe('dependency slipped');
  });

  it('drops a row that carries neither text nor movement', () => {
    expect(shapeComments([{ comment_text: '   ', category: 'note' }])).toHaveLength(0);
  });

  it('collapses whitespace and clamps a long body', () => {
    const out = shapeComments([{ comment_text: `a${'x'.repeat(2000)}` }]);
    expect(out[0].text.length).toBe(MAX_COMMENT_CHARS);
    expect(out[0].text.endsWith('…')).toBe(true);
  });

  it('normalises newlines out so the prompt stays one bullet per comment', () => {
    const out = shapeComments([{ comment_text: 'line one\n\nline two' }]);
    expect(out[0].text).toBe('line one line two');
  });

  it('caps the number of comments', () => {
    const rows = Array.from({ length: MAX_COMMENTS + 8 }, (_, i) => ({ comment_text: `c${i}` }));
    expect(shapeComments(rows)).toHaveLength(MAX_COMMENTS);
  });

  it('preserves order as given, so a caller ordering newest-first stays newest-first', () => {
    const out = shapeComments([{ comment_text: 'newest' }, { comment_text: 'older' }]);
    expect(out.map((c) => c.text)).toEqual(['newest', 'older']);
  });
});

describe('shapeTranscripts', () => {
  it('ignores a meeting linked to the epic with no transcript uploaded', () => {
    expect(shapeTranscripts([{ transcript_text: null, meeting_title: 'Kickoff' }])).toHaveLength(0);
  });

  it('caps transcript count', () => {
    const rows = Array.from({ length: MAX_TRANSCRIPTS + 3 }, () => ({ transcript_text: 'words' }));
    expect(shapeTranscripts(rows)).toHaveLength(MAX_TRANSCRIPTS);
  });
});

describe('renderHarvestForPrompt', () => {
  it('returns null when empty, so the prompt omits the heading entirely', () => {
    // An empty heading reads as "no evidence exists"; absence reads as "none found".
    expect(renderHarvestForPrompt({ comments: [], transcripts: [], empty: true })).toBeNull();
  });

  it('surfaces the movement and cause in the bullet prefix', () => {
    const harvest = {
      comments: shapeComments([
        {
          comment_text: 'Pushed to get security review in first.',
          created_at: '2026-07-14T10:00:00Z',
          category: 'scope',
          from_release: '2026.8',
          to_release: '2026.9',
          movement_cause: 'security review',
        },
      ]),
      transcripts: [],
      empty: false,
    };
    const text = renderHarvestForPrompt(harvest)!;
    expect(text).toContain('2026-07-14');
    expect(text).toContain('moved 2026.8 -> 2026.9');
    expect(text).toContain('cause: security review');
    expect(text).toContain('Pushed to get security review in first.');
  });

  it('labels a body-less movement rather than emitting a bare bullet', () => {
    const harvest = {
      comments: shapeComments([{ from_release: '2026.8', to_release: '2026.9' }]),
      transcripts: [],
      empty: false,
    };
    expect(renderHarvestForPrompt(harvest)).toContain('(no comment body)');
  });

  it('includes transcripts under their own heading', () => {
    const harvest = {
      comments: [],
      transcripts: shapeTranscripts([
        { transcript_text: 'We agreed pricing is add-on.', meeting_title: 'GTM sync', meeting_date: '2026-08-01T15:00:00Z' },
      ]),
      empty: false,
    };
    const text = renderHarvestForPrompt(harvest)!;
    expect(text).toContain('Meeting transcripts linked to this epic');
    expect(text).toContain('GTM sync — 2026-08-01');
    expect(text).toContain('pricing is add-on');
  });
});

describe('isHarvestEmpty', () => {
  it('is empty only when both sources are', () => {
    expect(isHarvestEmpty([], [])).toBe(true);
    expect(isHarvestEmpty(shapeComments([{ comment_text: 'x' }]), [])).toBe(false);
    expect(isHarvestEmpty([], shapeTranscripts([{ transcript_text: 'x' }]))).toBe(false);
  });
});
