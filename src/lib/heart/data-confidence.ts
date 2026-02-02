/**
 * Pendo Data Confidence Utilities
 * 
 * Helper functions for working with AI-assessed data confidence.
 * The actual confidence assessment is done by the HEART AI agent,
 * which can make nuanced judgments based on context.
 */

import type {
  PendoDataConfidence,
  PendoDataConfidenceLevel,
} from './types';

/**
 * Get a human-readable summary of confidence issues
 */
export function getConfidenceSummary(confidence: PendoDataConfidence): string {
  if (confidence.issues.length === 0) {
    return 'Data looks good';
  }
  
  const errorCount = confidence.issues.filter(i => i.severity === 'error').length;
  const warningCount = confidence.issues.filter(i => i.severity === 'warning').length;
  
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  }
  
  return `Data quality: ${parts.join(', ')}`;
}

/**
 * Get confidence badge color for UI
 */
export function getConfidenceBadgeColor(level: PendoDataConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'green';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'red';
    default:
      return 'gray';
  }
}
