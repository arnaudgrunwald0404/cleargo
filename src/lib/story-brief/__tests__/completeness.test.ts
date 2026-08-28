import { describe, it, expect } from '@jest/globals';
import { assessCompleteness } from '../completeness';
import type { StoryBriefContent } from '../generator';

function makeBrief(
  overrides: Partial<StoryBriefContent> = {}
): StoryBriefContent {
  return {
    what_we_are_building: {
      narrative:
        'This is a substantive narrative describing what we are building, ' +
        'with enough detail to pass the minimum character threshold.',
      claims: [
        { text: 'Feature X does Y', source: 'aha_description', grounded: true },
      ],
      open_flags: [],
      disruption_assessment: 'moderate',
    },
    why_we_prioritized_it: {
      narrative:
        'We prioritized this because customer feedback showed a clear gap ' +
        'in the market and our data indicated strong demand for this capability.',
      claims: [
        { text: '60% of enterprise customers asked for this', source: 'source_notes', grounded: true },
      ],
      open_flags: [],
    },
    value_story: {
      working_narrative:
        'Customers will be able to accomplish their goals faster and with ' +
        'less friction than the current workaround requires today.',
      vignette: 'Alice spends 30 minutes less per week on manual reporting.',
      roi_hypothesis: '20% reduction in support tickets related to reporting.',
      platform_pull_through:
        'This capability unlocks the analytics module and drives adoption of the new dashboard.',
      claims: [
        { text: 'Support ticket data from Q3', source: 'source_notes', grounded: true },
      ],
    },
    launch_scope: {
      in_scope: [{ item: 'Core reporting feature', note: 'Phase 1 delivery' }],
      out_of_scope: [{ item: 'Mobile app integration', reason: 'Deferred to Q2' }],
    },
    personas: [
      {
        persona: 'Enterprise PM',
        trigger_and_need:
          'Needs to report weekly to leadership on team velocity and blockers.',
        lead_message: 'Save 30 minutes per week on manual reporting.',
      },
    ],
    open_decisions: [
      {
        item: 'Naming: market-facing name confirmed?',
        owner: 'PMM',
        blocks: 'Every downstream asset inherits the name.',
        gate_type: 'naming',
        status: 'open',
      },
      {
        item: 'Pricing / packaging: included, add-on, or tier?',
        owner: 'CPO',
        blocks: 'Messaging, quoting guidance.',
        gate_type: 'pricing',
        status: 'open',
      },
      {
        item: 'Launch window + channels',
        owner: 'PMM',
        blocks: 'Workback dates and channel plan.',
        gate_type: 'launch_window',
        status: 'open',
      },
    ],
    soft_commitments: ['None identified'],
    downstream_deliverables: {
      chain: ['Messaging doc', 'Launch brief', 'Enablement doc'],
      enablement_plan: 'Sales enablement session scheduled for 2 weeks before GA.',
      marketing_plan: 'Blog post, customer case study, and in-product announcement.',
    },
    overall_confidence: 'high',
    ...overrides,
  };
}

describe('assessCompleteness', () => {
  it('returns score 0 for null content', () => {
    const result = assessCompleteness(null);
    expect(result.score).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].issue).toContain('No Story Brief');
  });

  it('returns score 1 and complete=true for a full brief', () => {
    const brief = makeBrief();
    const result = assessCompleteness(brief);
    expect(result.score).toBe(1);
    expect(result.complete).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.completeSections).toBe(9);
  });

  it('flags an empty narrative as missing', () => {
    const brief = makeBrief({
      what_we_are_building: {
        narrative: '',
        claims: [{ text: 'x', source: 'aha_description', grounded: true }],
        open_flags: [],
        disruption_assessment: 'none',
      },
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === "What we're building"
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('missing');
  });

  it('flags a short narrative as thin', () => {
    const brief = makeBrief({
      why_we_prioritized_it: {
        narrative: 'TBD',
        claims: [{ text: 'x', source: 'aha_description', grounded: true }],
        open_flags: [],
      },
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Why we prioritized it'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('thin');
  });

  it('flags ungrounded claims', () => {
    const brief = makeBrief({
      what_we_are_building: {
        narrative:
          'This is a substantive narrative describing what we are building, ' +
          'with enough detail to pass the minimum character threshold.',
        claims: [
          { text: 'Claim A', source: 'aha_description', grounded: true },
          { text: 'Claim B', source: 'unstated_assumption', grounded: false },
          { text: 'Claim C', source: 'unstated_assumption', grounded: false },
        ],
        open_flags: [],
        disruption_assessment: 'none',
      },
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === "What we're building" && g.severity === 'ungrounded'
    );
    expect(gap).toBeDefined();
  });

  it('flags many open_flags as ungrounded', () => {
    const brief = makeBrief({
      why_we_prioritized_it: {
        narrative:
          'We prioritized this because customer feedback showed a clear gap ' +
          'in the market and our data indicated strong demand for this capability.',
        claims: [{ text: 'x', source: 'aha_description', grounded: true }],
        open_flags: ['flag1', 'flag2', 'flag3', 'flag4'],
      },
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Why we prioritized it' && g.severity === 'ungrounded'
    );
    expect(gap).toBeDefined();
  });

  it('flags empty value_story sub-fields', () => {
    const brief = makeBrief({
      value_story: {
        working_narrative: '',
        vignette: '',
        roi_hypothesis: '',
        platform_pull_through: '',
        claims: [{ text: 'x', source: 'aha_description', grounded: true }],
      },
    });
    const result = assessCompleteness(brief);
    const gaps = result.gaps.filter(
      (g) => g.section === 'Value story'
    );
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].severity).toBe('missing');
  });

  it('flags empty launch_scope', () => {
    const brief = makeBrief({
      launch_scope: { in_scope: [], out_of_scope: [] },
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Launch scope'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('missing');
  });

  it('flags missing personas', () => {
    const brief = makeBrief({ personas: [] });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Personas & segments'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('missing');
  });

  it('flags thin personas', () => {
    const brief = makeBrief({
      personas: [
        { persona: 'PM', trigger_and_need: '', lead_message: '' },
        {
          persona: 'Engineer',
          trigger_and_need: 'Needs API docs',
          lead_message: 'Self-serve API access',
        },
      ],
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Personas & segments'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('thin');
  });

  it('flags missing open_decisions', () => {
    const brief = makeBrief({ open_decisions: [] });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Open decisions'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('missing');
  });

  it('does not flag "None identified" soft_commitments', () => {
    const brief = makeBrief({ soft_commitments: ['None identified'] });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Soft commitments'
    );
    expect(gap).toBeUndefined();
  });

  it('flags empty soft_commitments', () => {
    const brief = makeBrief({ soft_commitments: [] });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Soft commitments'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('missing');
  });

  it('flags low confidence as thin', () => {
    const brief = makeBrief({ overall_confidence: 'low' });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Overall confidence'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('thin');
  });

  it('flags empty downstream_deliverables', () => {
    const brief = makeBrief({
      downstream_deliverables: {
        chain: [],
        enablement_plan: '',
        marketing_plan: '',
      },
    });
    const result = assessCompleteness(brief);
    const gap = result.gaps.find(
      (g) => g.section === 'Downstream deliverables'
    );
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('missing');
  });

  it('computes fractional score correctly', () => {
    // Break 2 sections: empty personas + empty soft_commitments
    const brief = makeBrief({
      personas: [],
      soft_commitments: [],
    });
    const result = assessCompleteness(brief);
    // 7/9 complete = 0.78
    expect(result.score).toBe(0.78);
    expect(result.complete).toBe(false); // < 0.8
    expect(result.completeSections).toBe(7);
  });

  it('is complete when 8/9 sections are good (score >= 0.8)', () => {
    // Break just soft_commitments
    const brief = makeBrief({
      soft_commitments: [],
    });
    const result = assessCompleteness(brief);
    // 8/9 = 0.89
    expect(result.score).toBe(0.89);
    expect(result.complete).toBe(true);
    expect(result.completeSections).toBe(8);
  });
});