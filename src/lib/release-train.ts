/** Matches standard monthly trains, e.g. "Release 2026.6". Excludes one-offs like "HRSG Competencies Sunset". */
export const STANDARD_RELEASE_TRAIN_PATTERN = /^Release\s+\d{4}\.\d+$/i;

export function isStandardReleaseTrainName(releaseName: string | null | undefined): boolean {
  if (!releaseName || typeof releaseName !== 'string') return false;
  return STANDARD_RELEASE_TRAIN_PATTERN.test(releaseName.trim());
}
