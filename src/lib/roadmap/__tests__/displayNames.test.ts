import {
  formatSnapshotContactDisplay,
  getDisplayName,
  getDisplayPod,
  getPlanVsActualFeatureName,
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

describe('getPlanVsActualFeatureName', () => {
  it('prefers distinct pivot Epic name over GTM name', () => {
    expect(
      getPlanVsActualFeatureName({
        aha_key: 'APP-E-1210',
        end_aha_name: 'AI Sourcing Max (NinjaHire) - Beta Program',
        end_gtm_name: 'AI Sourcing Max',
      }),
    ).toBe('AI Sourcing Max (NinjaHire) - Beta Program');
  });

  it('uses live epic title when snapshot only has GTM label', () => {
    expect(
      getPlanVsActualFeatureName(
        {
          aha_key: 'APP-E-1210',
          end_aha_name: 'AI Sourcing Max',
          end_gtm_name: 'AI Sourcing Max',
        },
        'AI Sourcing Max (Beta Launch)',
      ),
    ).toBe('AI Sourcing Max (Beta Launch)');
  });

  it('does not replace distinct Epic name with shorter live title', () => {
    expect(
      getPlanVsActualFeatureName(
        {
          aha_key: 'APP-E-1208',
          end_aha_name: 'AI Social Media Sourcing (Reelist) - Beta Pr',
          end_gtm_name: 'Social Media Sourcing',
        },
        'Social Media Sourcing',
      ),
    ).toBe('AI Social Media Sourcing (Reelist) - Beta Pr');
  });
});
