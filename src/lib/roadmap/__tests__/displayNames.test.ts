import {
  formatSnapshotContactDisplay,
  getDisplayName,
  getDisplayPod,
} from '../displayNames';

describe('formatSnapshotContactDisplay', () => {
  it('strips HTML status pills and returns first token when no email', () => {
    const raw = `mrosenberg\n\n<span class="status-pill">Recruiting Experience</span>`;
    expect(formatSnapshotContactDisplay(raw)).toBe('mrosenberg');
  });

  it('returns email local part when present', () => {
    expect(formatSnapshotContactDisplay('jane.doe@company.com')).toBe('jane.doe');
  });
});

describe('getDisplayName / getDisplayPod', () => {
  it('prefers GTM fields when set', () => {
    expect(
      getDisplayName({
        gtm_name: 'GTM title',
        aha_name: 'Epic title',
        aha_key: 'X-1',
      }),
    ).toBe('GTM title');
    expect(
      getDisplayPod({
        gtm_module: 'Module A',
        aha_pod: 'Pod B',
      }),
    ).toBe('Module A');
  });

  it('strips HTML from GTM module / pod pills', () => {
    const pill =
      '<span class="status-pill" style="color:red;">Candidate Attraction</span>';
    expect(getDisplayPod({ gtm_module: pill, aha_pod: '' })).toBe('Candidate Attraction');
    expect(getDisplayName({ gtm_name: '', aha_name: pill, aha_key: 'X-2' })).toBe(
      'Candidate Attraction',
    );
  });
});
