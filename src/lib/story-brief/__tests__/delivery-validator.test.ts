import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// jest.mock() + require() (rather than static imports) BEFORE importing the module under test,
// so the mocks are registered before delivery-validator.ts's own imports resolve — matches the
// pattern used in src/lib/__tests__/roles.test.ts, but ordered explicitly rather than relying on
// jest.mock hoisting.
jest.mock('@/lib/jira/client', () => ({
  getJiraEpic: jest.fn(),
  searchJiraIssues: jest.fn(),
}));
jest.mock('@/lib/jira/resolve-and-cache-epic-key', () => ({
  resolveAndCacheJiraEpicKey: jest.fn(),
}));

const { getJiraEpic, searchJiraIssues } = require('@/lib/jira/client');
const { resolveAndCacheJiraEpicKey } = require('@/lib/jira/resolve-and-cache-epic-key');
const { validateEpicDelivery, extractAhaDescription } = require('../delivery-validator');
import type { EpicForValidation } from '../delivery-validator';

const mockSupabase: any = {};

function makeEpic(overrides: Partial<EpicForValidation> = {}): EpicForValidation {
  return {
    id: 'epic-1',
    name: 'Test Epic',
    aha_id: 'AHA-1',
    jira_epic_key: 'PROJ-100',
    aha_fields: {
      standard_fields: {
        description: '<p>Some description</p>',
        workflow_status: 'In Progress',
      },
    },
    ...overrides,
  };
}

describe('validateEpicDelivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects no gap when Jira epic and all children are Done and Aha claims shipped', async () => {
    (getJiraEpic as jest.Mock).mockResolvedValue({
      fields: { status: { name: 'Done', statusCategory: { name: 'Done' } } },
    });
    (searchJiraIssues as jest.Mock).mockResolvedValue([
      { key: 'PROJ-101', fields: { summary: 'a', status: { name: 'Done', statusCategory: { name: 'Done' } } } },
      { key: 'PROJ-102', fields: { summary: 'b', status: { name: 'Done', statusCategory: { name: 'Done' } } } },
    ]);

    const epic = makeEpic({
      aha_fields: { standard_fields: { description: 'x', workflow_status: 'Shipped' } },
    });
    const result = await validateEpicDelivery(epic, mockSupabase);

    expect(result.gap_detected).toBe(false);
    expect(result.gap_description).toBeNull();
    expect(result.child_issue_done).toBe(2);
    expect(result.child_issue_total).toBe(2);
  });

  it('detects a gap when Aha claims shipped but child issues are incomplete', async () => {
    (getJiraEpic as jest.Mock).mockResolvedValue({
      fields: { status: { name: 'In Progress', statusCategory: { name: 'In Progress' } } },
    });
    (searchJiraIssues as jest.Mock).mockResolvedValue([
      { key: 'PROJ-101', fields: { summary: 'a', status: { name: 'Done', statusCategory: { name: 'Done' } } } },
      { key: 'PROJ-102', fields: { summary: 'b', status: { name: 'To Do', statusCategory: { name: 'To Do' } } } },
    ]);

    const epic = makeEpic({
      aha_fields: { standard_fields: { description: 'x', workflow_status: 'Shipped' } },
    });
    const result = await validateEpicDelivery(epic, mockSupabase);

    expect(result.gap_detected).toBe(true);
    expect(result.gap_description).toContain('Aha workflow_status');
    expect(result.gap_description).toContain('1 of 2 child issues incomplete');
    expect(result.gap_description).toContain('PROJ-102');
  });

  it('does not flag a gap when nothing claims shipped', async () => {
    (getJiraEpic as jest.Mock).mockResolvedValue({
      fields: { status: { name: 'In Progress', statusCategory: { name: 'In Progress' } } },
    });
    (searchJiraIssues as jest.Mock).mockResolvedValue([
      { key: 'PROJ-101', fields: { summary: 'a', status: { name: 'To Do', statusCategory: { name: 'To Do' } } } },
    ]);

    const epic = makeEpic({
      aha_fields: { standard_fields: { description: 'x', workflow_status: 'In Progress' } },
    });
    const result = await validateEpicDelivery(epic, mockSupabase);

    expect(result.gap_detected).toBe(false);
  });

  it('degrades gracefully when Jira epic fetch throws', async () => {
    (getJiraEpic as jest.Mock).mockRejectedValue(new Error('Jira down'));
    (searchJiraIssues as jest.Mock).mockRejectedValue(new Error('Jira down'));

    const epic = makeEpic();
    const result = await validateEpicDelivery(epic, mockSupabase);

    expect(result.jira_available).toBe(false);
    expect(result.gap_detected).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('resolves a missing jira_epic_key via resolveAndCacheJiraEpicKey', async () => {
    (resolveAndCacheJiraEpicKey as jest.Mock).mockResolvedValue({
      jiraEpicKey: 'PROJ-200',
      source: 'jira_search',
    });
    (getJiraEpic as jest.Mock).mockResolvedValue({
      fields: { status: { name: 'To Do', statusCategory: { name: 'To Do' } } },
    });
    (searchJiraIssues as jest.Mock).mockResolvedValue([]);

    const epic = makeEpic({ jira_epic_key: null });
    const result = await validateEpicDelivery(epic, mockSupabase);

    expect(resolveAndCacheJiraEpicKey).toHaveBeenCalledWith(epic, mockSupabase);
    expect(result.jira_epic_key).toBe('PROJ-200');
  });

  it('handles missing Aha fields without throwing', async () => {
    (getJiraEpic as jest.Mock).mockResolvedValue({
      fields: { status: { name: 'To Do', statusCategory: { name: 'To Do' } } },
    });
    (searchJiraIssues as jest.Mock).mockResolvedValue([]);

    const epic = makeEpic({ aha_fields: null });
    const result = await validateEpicDelivery(epic, mockSupabase);

    expect(result.aha_available).toBe(false);
    expect(result.aha_description).toBeNull();
    expect(result.gap_detected).toBe(false);
  });
});

describe('extractAhaDescription', () => {
    it('strips tags from a plain HTML string', () => {
        expect(extractAhaDescription('<p>Ships <b>Q3</b></p>')).toBe('Ships Q3');
    });

    it('reads the body out of an Aha note object', () => {
        // The real shape from Aha: description is a note, not a string. Passing
        // this object to stripHtml threw "html.replace is not a function" and
        // killed the entire draft for every epic in the launch.
        expect(extractAhaDescription({ id: '123', body: '<p>Ships Q3</p>' })).toBe('Ships Q3');
    });

    it('falls back through the other shapes seen in the wild', () => {
        expect(extractAhaDescription({ html_body: '<i>Beta only</i>' })).toBe('Beta only');
        expect(extractAhaDescription({ text: 'Plain text' })).toBe('Plain text');
    });

    it('returns null rather than stringifying an unrecognised shape', () => {
        // "[object Object]" quoted into a customer-facing brief is far worse
        // than an honest absence.
        expect(extractAhaDescription({ unexpected: 42 })).toBeNull();
        expect(extractAhaDescription([1, 2, 3])).toBeNull();
        expect(extractAhaDescription(null)).toBeNull();
        expect(extractAhaDescription(undefined)).toBeNull();
        expect(extractAhaDescription(42)).toBeNull();
    });

    it('treats a tags-only description as absent', () => {
        expect(extractAhaDescription('<p></p>')).toBeNull();
    });
});
