import type { TaskStatus } from '@/types/launches';

export function calculateLaunchReadiness(statuses: Array<{ status: TaskStatus }>): number {
  if (statuses.length === 0) return 0;
  const done = statuses.filter(s => s.status === 'DONE').length;
  return Math.round((done / statuses.length) * 100);
}
