/**
 * HEART Metrics Framework
 * Google's HEART: Happiness, Engagement, Adoption, Retention, Task Success
 */

// Types
export * from './types';

// Services
export {
  // Categories
  getHeartCategories,
  // Config
  getEpicHeartConfig,
  createEpicHeartConfig,
  updateEpicHeartConfigStatus,
  // Metrics
  getEpicHeartMetrics,
  getEpicHeartMetricsByEpicId,
  createEpicHeartMetric,
  updateEpicHeartMetric,
  deleteEpicHeartMetric,
  // AI Setup
  setupHeartMetricsWithAI,
  applyRecommendations,
  // Snapshots
  getLatestSnapshot,
  getSnapshots,
  // Dashboard
  getEpicHeartDashboard,
  getEpicsHeartList,
  getEpicHeartReleaseView,
  // Surveys
  createHeartSurvey,
  getHeartSurvey,
  // Initial & Daily Snapshots
  createInitialSnapshots,
  createDailySnapshots,
  createYesterdaySnapshots,
  // Live Data
  fetchLiveMetricValue,
} from './service';

// AI Agent
export {
  runHeartAgent,
  generateMetricName,
  type HeartAgentResult,
} from './agent';

// Data Confidence Helpers
export {
  getConfidenceSummary,
  getConfidenceBadgeColor,
} from './data-confidence';

// Pendo Context
export {
  getPendoContextForAgent,
  getEpicContextForAgent,
  buildAgentContext,
  syncPendoEventsCache,
  getCachedPendoEvents,
  findRelatedEvents,
  findRelatedEntities,
} from './pendo-context';

// Snapshot Calculator
export {
  createMetricSnapshot,
  createEpicSnapshots,
  createAllSnapshots,
} from './snapshot-calculator';

// Happiness Automation
export {
  // CRUD
  createAutomationRule,
  getAutomationRule,
  listAutomationRules,
  updateAutomationRule,
  deleteAutomationRule,
  // Lifecycle
  activateRule,
  pauseRule,
  // Evaluation & Execution
  evaluateRuleTrigger,
  getTargetAudience,
  executeAction,
  // CSM Nudges
  getPendingCsmNudges,
  assignNudgeToCsm,
  updateNudgeStatus,
  // Metrics
  recordAutomationMetrics,
  getDashboardSummary,
  // Scheduled Jobs
  runScheduledEvaluations,
} from './happiness-automation';
