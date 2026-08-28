import {
  findEpicDateConflicts,
  describeEpicDateConflicts,
} from '../launchEpicDateConflicts';

const epic = (id: string, date: string | null) => ({
  id,
  name: `Epic ${id}`,
  target_launch_date: date,
});

describe('findEpicDateConflicts', () => {
  it('flags an epic that ships after the launch', () => {
    const c = findEpicDateConflicts({
      launchDate: '2026-09-01',
      epics: [epic('a', '2026-09-15')],
    });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ epicId: 'a', epicDate: '2026-09-15', daysEarly: 14 });
  });

  it('accepts an epic shipping on the launch date', () => {
    // Shipping the same day is a normal simultaneous launch, not a conflict.
    expect(
      findEpicDateConflicts({ launchDate: '2026-09-01', epics: [epic('a', '2026-09-01')] })
    ).toEqual([]);
  });

  it('accepts an epic that already shipped', () => {
    expect(
      findEpicDateConflicts({ launchDate: '2026-09-01', epics: [epic('a', '2026-08-01')] })
    ).toEqual([]);
  });

  it('orders worst first so a truncated list shows the biggest problem', () => {
    const c = findEpicDateConflicts({
      launchDate: '2026-09-01',
      epics: [epic('near', '2026-09-05'), epic('far', '2026-10-01'), epic('mid', '2026-09-20')],
    });
    expect(c.map((x) => x.epicId)).toEqual(['far', 'mid', 'near']);
  });

  it('ignores epics with no date, and a launch with no date', () => {
    expect(
      findEpicDateConflicts({ launchDate: '2026-09-01', epics: [epic('a', null)] })
    ).toEqual([]);
    expect(
      findEpicDateConflicts({ launchDate: null, epics: [epic('a', '2026-12-01')] })
    ).toEqual([]);
  });

  it('tolerates a timestamp where a date is expected', () => {
    const c = findEpicDateConflicts({
      launchDate: '2026-09-01',
      epics: [{ id: 'a', name: 'Epic a', target_launch_date: '2026-09-08T00:00:00Z' }],
    });
    expect(c[0].daysEarly).toBe(7);
  });

  it('returns nothing for a launch with no epics', () => {
    expect(findEpicDateConflicts({ launchDate: '2026-09-01', epics: [] })).toEqual([]);
  });
});

describe('describeEpicDateConflicts', () => {
  it('is null when there is nothing wrong', () => {
    expect(describeEpicDateConflicts([])).toBeNull();
  });

  it('names the epic when there is one', () => {
    const c = findEpicDateConflicts({
      launchDate: '2026-09-01',
      epics: [epic('a', '2026-09-02')],
    });
    expect(describeEpicDateConflicts(c)).toBe('This launch is 1 day before Epic a ships (2026-09-02).');
  });

  it('counts them and names the worst when there are several', () => {
    const c = findEpicDateConflicts({
      launchDate: '2026-09-01',
      epics: [epic('a', '2026-09-05'), epic('b', '2026-10-01')],
    });
    expect(describeEpicDateConflicts(c)).toContain('2 of its epics');
    expect(describeEpicDateConflicts(c)).toContain('Epic b');
  });
});
