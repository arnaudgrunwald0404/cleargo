import {
  normalizeSurveyScore,
  calculateFrustrationHealth,
  calculateHappinessCompositeScore,
  DEFAULT_HAPPINESS_COMPOSITE_CONFIG,
} from '@/lib/heart/happiness-composite';

describe('happiness composite helpers', () => {
  it('normalizes common survey scales to 0-100', () => {
    expect(normalizeSurveyScore(4, 'satisfaction')).toBe(80);
    expect(normalizeSurveyScore(8, 'nps')).toBe(80);
    expect(normalizeSurveyScore(1, 'yes_no')).toBe(100);
    expect(normalizeSurveyScore(0, 'yes_no')).toBe(0);
  });

  it('uses frustration health directly when no survey data', () => {
    const result = calculateHappinessCompositeScore(
      null,
      70,
      DEFAULT_HAPPINESS_COMPOSITE_CONFIG
    );

    expect(result.surveyUsed).toBe(0);
    expect(result.surveySource).toBe('frustration_only');
    expect(result.score).toBe(70);
  });

  it('uses real survey score when present', () => {
    const result = calculateHappinessCompositeScore(
      60,
      90,
      DEFAULT_HAPPINESS_COMPOSITE_CONFIG
    );

    expect(result.surveyUsed).toBe(60);
    expect(result.surveySource).toBe('survey_responses');
    expect(result.score).toBeCloseTo(69, 5); // 0.7*60 + 0.3*90
  });

  it('increases frustration penalty with higher event density', () => {
    const low = calculateFrustrationHealth(5, 100, 30);
    const high = calculateFrustrationHealth(60, 100, 30);

    expect(low.penalty).toBeLessThan(high.penalty);
    expect(low.health).toBeGreaterThan(high.health);
    expect(high.penalty).toBe(100);
    expect(high.health).toBe(0);
  });
});
