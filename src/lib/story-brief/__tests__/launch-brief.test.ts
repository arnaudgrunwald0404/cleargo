import { describe, it, expect } from '@jest/globals';
import { deriveLaunchBrief } from '../launch-brief';
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

describe('deriveLaunchBrief', () => {
  it('returns score 0 and isComplete=false for empty epic list', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      []
    );
    expect(brief.overallScore).toBe(0);
    expect(brief.isComplete).toBe(false);
    expect(brief.epics).toHaveLength(0);
  });

  it('returns score 1 and isComplete=true when all epics are complete', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief(),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: makeBrief(),
        },
      ]
    );
    expect(brief.overallScore).toBe(1);
    expect(brief.isComplete).toBe(true);
    expect(brief.missingBriefEpicIds).toHaveLength(0);
    expect(brief.incompleteEpicIds).toHaveLength(0);
  });

  it('uses min score across epics', () => {
    // Epic 1 is complete (score 1), Epic 2 has empty personas + empty soft_commitments (score 7/9)
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief(),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: makeBrief({ personas: [], soft_commitments: [] }),
        },
      ]
    );
    expect(brief.overallScore).toBeCloseTo(0.78, 2);
    expect(brief.isComplete).toBe(false);
    expect(brief.incompleteEpicIds).toContain('e2');
  });

  it('marks epics with null content as missing', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief(),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: null,
        },
      ]
    );
    expect(brief.missingBriefEpicIds).toContain('e2');
    expect(brief.isComplete).toBe(false);
    expect(brief.overallScore).toBe(0); // min of [1, 0]
  });

  it('deduplicates personas by name', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief({ personas: [{ persona: 'PM', trigger_and_need: 'needs reports', lead_message: 'save time' }] }),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: makeBrief({ personas: [{ persona: 'PM', trigger_and_need: 'needs dashboards', lead_message: 'real-time data' }] }),
        },
      ]
    );
    // Should only have one "PM" persona (first one wins)
    const pmPersonas = brief.personas.filter((p) => p.persona === 'PM');
    expect(pmPersonas).toHaveLength(1);
    expect(pmPersonas[0].epic_name).toBe('Epic 1');
  });

  it('combines open decisions from all epics', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief(),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: makeBrief(),
        },
      ]
    );
    // Each epic has 3 standing gates → 6 total
    expect(brief.openDecisions).toHaveLength(6);
  });

  it('deduplicates soft commitments', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief({ soft_commitments: ['Beta access for Q1', 'None identified'] }),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: makeBrief({ soft_commitments: ['Beta access for Q1', 'Early access docs'] }),
        },
      ]
    );
    expect(brief.softCommitments).toContain('Beta access for Q1');
    expect(brief.softCommitments).toContain('None identified');
    expect(brief.softCommitments).toContain('Early access docs');
    expect(brief.softCommitments).toHaveLength(3);
  });

  it('combines downstream deliverables chain', () => {
    const brief = deriveLaunchBrief(
      { id: 'l1', name: 'Q1 Launch', tier: 'TIER_1', target_launch_date: '2027-01-15' },
      [
        {
          epicId: 'e1',
          epicName: 'Epic 1',
          pmOwnerEmail: 'pm1@example.com',
          content: makeBrief({
            downstream_deliverables: {
              chain: ['Messaging doc', 'Launch brief'],
              enablement_plan: 'Plan A',
              marketing_plan: 'Plan B',
            },
          }),
        },
        {
          epicId: 'e2',
          epicName: 'Epic 2',
          pmOwnerEmail: 'pm2@example.com',
          content: makeBrief({
            downstream_deliverables: {
              chain: ['Launch brief', 'Enablement doc'],
              enablement_plan: 'Plan C',
              marketing_plan: 'Plan D',
            },
          }),
        },
      ]
    );
    // Deduplicated: Messaging doc, Launch brief, Enablement doc
    expect(brief.downstreamChain).toHaveLength(3);
    expect(brief.downstreamChain).toContain('Launch brief');
  });
});