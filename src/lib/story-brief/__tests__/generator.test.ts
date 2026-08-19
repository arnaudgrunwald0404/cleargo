import { describe, it, expect } from '@jest/globals';
import {
  postProcessGrounding,
  isReadyToRatify,
  toStoryBriefContent,
  type StoryBriefOutput,
} from '../generator';
import type { StoryBriefContext } from '../context';
import type { DeliveryValidationResult } from '../delivery-validator';

function makeValidation(overrides: Partial<DeliveryValidationResult> = {}): DeliveryValidationResult {
  return {
    aha_available: true,
    aha_description: 'We are building a clone requisition feature.',
    aha_workflow_status: 'In Progress',
    jira_available: true,
    jira_epic_key: 'PROJ-1',
    jira_epic_status: 'In Progress',
    jira_epic_status_category: 'In Progress',
    child_issues: [],
    child_issue_total: 0,
    child_issue_done: 0,
    gap_detected: false,
    gap_description: null,
    errors: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<DeliveryValidationResult> = {}): StoryBriefContext {
  return {
    epic: {
      id: 'epic-1',
      name: 'Test Epic',
      tier: 'TIER_2',
      aha_id: 'AHA-1',
      jira_epic_key: 'PROJ-1',
      owner_email: 'pm@example.com',
      target_launch_date: '2026-09-01',
      scheduled_ga_dev_date: '2026-09-15',
      status: 'Pre_Release',
    },
    validation: makeValidation(overrides),
  };
}

function makeOutput(overrides: Partial<StoryBriefOutput> = {}): StoryBriefOutput {
  return {
    what_we_are_building: {
      narrative: 'We are building a clone requisition feature.',
      claims: [{ text: 'We are building a clone requisition feature.', source: 'aha_description', grounded: true }],
      open_flags: [],
      disruption_assessment: 'moderate',
    },
    why_we_prioritized_it: {
      narrative: 'Customers asked for it.',
      claims: [],
      open_flags: [],
    },
    value_story: {
      working_narrative: 'Saves time.',
      vignette: 'Before/after story.',
      roi_hypothesis: 'Time saved per req.',
      platform_pull_through: 'Extends the hire workflow.',
      claims: [],
    },
    launch_scope: { in_scope: [], out_of_scope: [] },
    personas: [],
    open_decisions: [],
    soft_commitments: ['None identified'],
    downstream_deliverables: { chain: [], enablement_plan: '', marketing_plan: '' },
    overall_confidence: 'high',
    ...overrides,
  };
}

describe('postProcessGrounding', () => {
  it('forces unstated_assumption claims to grounded:false regardless of model self-report', () => {
    const output = makeOutput({
      what_we_are_building: {
        narrative: 'x',
        disruption_assessment: 'none',
        open_flags: [],
        claims: [{ text: 'This will 10x conversion', source: 'unstated_assumption', grounded: true }],
      },
    });
    const result = postProcessGrounding(output, makeContext());
    expect(result.what_we_are_building.claims[0].grounded).toBe(false);
    expect(result.what_we_are_building.open_flags).toContain('This will 10x conversion');
  });

  it('leaves a banned phrase grounded when it appears verbatim in the Aha description', () => {
    const context = makeContext({ aha_description: 'This is a revolutionary change to req creation.' });
    const output = makeOutput({
      what_we_are_building: {
        narrative: 'x',
        disruption_assessment: 'none',
        open_flags: [],
        claims: [{ text: 'This is a revolutionary change.', source: 'aha_description', grounded: true }],
      },
    });
    const result = postProcessGrounding(output, context);
    expect(result.what_we_are_building.claims[0].grounded).toBe(true);
  });

  it('flags a banned phrase not present in any source as ungrounded', () => {
    const output = makeOutput({
      what_we_are_building: {
        narrative: 'x',
        disruption_assessment: 'none',
        open_flags: [],
        claims: [{ text: 'This is a game-changing update.', source: 'aha_description', grounded: true }],
      },
    });
    const result = postProcessGrounding(output, makeContext());
    expect(result.what_we_are_building.claims[0].grounded).toBe(false);
    expect(result.what_we_are_building.open_flags).toContain('This is a game-changing update.');
  });

  it('recomputes confidence rather than trusting the model, downgrading when Jira is unavailable', () => {
    const context = makeContext({ jira_available: false });
    const output = makeOutput({ overall_confidence: 'high' });
    const result = postProcessGrounding(output, context);
    expect(result.overall_confidence).not.toBe('high');
  });

  it('downgrades to low confidence when a delivery gap is detected and claims are mostly ungrounded', () => {
    const context = makeContext({ gap_detected: true, gap_description: 'Shipped but incomplete.' });
    const output = makeOutput({
      overall_confidence: 'high',
      what_we_are_building: {
        narrative: 'x',
        disruption_assessment: 'none',
        open_flags: [],
        claims: [
          { text: 'a', source: 'unstated_assumption', grounded: true },
          { text: 'b', source: 'unstated_assumption', grounded: true },
        ],
      },
    });
    const result = postProcessGrounding(output, context);
    expect(result.overall_confidence).toBe('low');
  });
});

describe('isReadyToRatify', () => {
  it('is true for an empty list', () => {
    expect(isReadyToRatify([])).toBe(true);
  });

  it('is true when every item is resolved or deferred', () => {
    expect(isReadyToRatify([{ status: 'resolved' }, { status: 'deferred' }])).toBe(true);
  });

  it('is false when any item is still open', () => {
    expect(isReadyToRatify([{ status: 'resolved' }, { status: 'open' }])).toBe(false);
  });

  it('is false when status is missing', () => {
    expect(isReadyToRatify([{}])).toBe(false);
  });
});

describe('toStoryBriefContent', () => {
  it('defaults every open decision to status "open"', () => {
    const output = makeOutput({
      open_decisions: [
        { item: 'Naming', owner: 'PMM', blocks: 'materials', gate_type: 'naming' },
        { item: 'Pricing', owner: 'Finance', blocks: 'quoting', gate_type: 'pricing' },
      ],
    });
    const content = toStoryBriefContent(output);
    expect(content.open_decisions.every((d) => d.status === 'open')).toBe(true);
    expect(content.open_decisions).toHaveLength(2);
  });
});
