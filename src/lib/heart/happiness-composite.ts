import type { HeartHappinessCompositeConfig } from './types';

export const DEFAULT_HAPPINESS_COMPOSITE_CONFIG: HeartHappinessCompositeConfig = {
  surveyWeight: 0.7,
  frustrationWeight: 0.3,
  optimisticSurveyBaseline: 80,
  frustrationEventIds: [],
  frustrationSegmentId: null,
  frustrationEventsPer100UsersAtMaxPenalty: 30,
};

export function clampToPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function normalizeSurveyScore(value: number | null, surveyType: string | null): number | null {
  if (value === null) return null;

  switch (surveyType) {
    case 'nps':
      return clampToPercent(value * 10);
    case 'satisfaction':
      return clampToPercent(value * 20);
    case 'yes_no':
      return value > 0 ? 100 : 0;
    default:
      return value <= 10 ? clampToPercent(value * 10) : clampToPercent(value);
  }
}

export function calculateFrustrationHealth(
  totalEvents: number,
  uniqueUsers: number,
  eventsPer100UsersAtMaxPenalty: number
): { penalty: number; health: number; eventsPer100Users: number } {
  const per100Users = uniqueUsers > 0 ? (totalEvents / uniqueUsers) * 100 : totalEvents > 0 ? 100 : 0;
  const maxPenaltyRate = Math.max(1, eventsPer100UsersAtMaxPenalty || 30);
  const penalty = clampToPercent((per100Users / maxPenaltyRate) * 100);
  const health = clampToPercent(100 - penalty);

  return {
    penalty,
    health,
    eventsPer100Users: per100Users,
  };
}

export function calculateHappinessCompositeScore(
  surveyScoreNormalized: number | null,
  frustrationHealth: number,
  config: Pick<HeartHappinessCompositeConfig, 'surveyWeight' | 'frustrationWeight' | 'optimisticSurveyBaseline'>
): { score: number; surveyUsed: number; surveySource: 'survey_responses' | 'frustration_only' } {
  if (surveyScoreNormalized === null) {
    return {
      score: clampToPercent(frustrationHealth),
      surveyUsed: 0,
      surveySource: 'frustration_only',
    };
  }

  const score = clampToPercent(
    (config.surveyWeight * surveyScoreNormalized) + (config.frustrationWeight * frustrationHealth)
  );

  return {
    score,
    surveyUsed: surveyScoreNormalized,
    surveySource: 'survey_responses',
  };
}
