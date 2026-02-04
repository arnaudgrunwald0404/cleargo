/**
 * Retro Reminder Service
 * Handles finding epics with due retros and sending reminders
 */

import { getClient } from '@/lib/db';
import type { DayMarker } from '@/lib/success/types';

export interface EpicWithDueRetro {
  epicId: string;
  epicName: string;
  launchDate: string;
  daysSinceLaunch: number;
  dueRetros: DayMarker[];
  postLaunchOwnerEmail: string;
  postLaunchOwnerId: string;
}

/**
 * Calculate days since launch date
 */
export function calculateDaysSinceLaunch(launchDate: string): number {
  const launch = new Date(launchDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  launch.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - launch.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get list of retros that are due based on days since launch
 */
export function getDueRetros(daysSinceLaunch: number, reminderDaysBefore: number = 3): DayMarker[] {
  const due: DayMarker[] = [];
  const dayMarkers: DayMarker[] = [30, 60, 90];

  for (const marker of dayMarkers) {
    const dueDate = marker;
    const reminderDate = dueDate - reminderDaysBefore;
    
    // Retro is due if we're within the reminder window (e.g., 3 days before to 7 days after)
    if (daysSinceLaunch >= reminderDate && daysSinceLaunch <= dueDate + 7) {
      due.push(marker);
    }
  }

  return due;
}

/**
 * Find epics with retros that are due
 */
export async function getEpicsWithDueRetros(reminderDaysBefore: number = 3): Promise<EpicWithDueRetro[]> {
  const supabase = getClient();
  const today = new Date().toISOString().split('T')[0];

  // Query epics that are launched
  const { data: epics, error } = await supabase
    .from('epic')
    .select(`
      id,
      name,
      target_launch_date,
      status
    `)
    .in('status', ['Released_Cohort_1', 'Released_GA', 'Released_Retroed'])
    .lte('target_launch_date', today)
    .not('target_launch_date', 'is', null);

  if (error) {
    console.error('Error fetching epics for retro reminders:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) {
    return [];
  }

  // Get success configs for these epics
  const epicIds = epics.map(e => e.id);
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select(`
      epic_id,
      post_launch_owner,
      post_launch_owner_user:app_user!post_launch_owner(email, id)
    `)
    .in('epic_id', epicIds);

  const configMap = new Map((configs || []).map(c => [c.epic_id, c]));

  const results: EpicWithDueRetro[] = [];

  for (const epic of epics) {
    if (!epic.target_launch_date) continue;

    const config = configMap.get(epic.id);
    if (!config) continue;
    
    const ownerUser = Array.isArray(config.post_launch_owner_user) 
      ? config.post_launch_owner_user[0] 
      : config.post_launch_owner_user;
    if (!ownerUser) continue;

    const daysSinceLaunch = calculateDaysSinceLaunch(epic.target_launch_date);
    const dueRetros = getDueRetros(daysSinceLaunch, reminderDaysBefore);

    if (dueRetros.length === 0) continue;

    // Check which retros are already submitted
    const { data: submittedRetros } = await supabase
      .from('epic_retros')
      .select('day_marker')
      .eq('epic_id', epic.id)
      .eq('status', 'SUBMITTED')
      .in('day_marker', dueRetros);

    const submittedMarkers = new Set((submittedRetros || []).map(r => r.day_marker));
    const pendingRetros = dueRetros.filter(marker => !submittedMarkers.has(marker));

    if (pendingRetros.length === 0) continue;

    results.push({
      epicId: epic.id,
      epicName: epic.name,
      launchDate: epic.target_launch_date,
      daysSinceLaunch,
      dueRetros: pendingRetros,
      postLaunchOwnerEmail: ownerUser.email,
      postLaunchOwnerId: ownerUser.id,
    });
  }

  return results;
}

/**
 * Send retro reminder (placeholder - will call Slack notification)
 */
export async function sendRetroReminder(
  epicId: string,
  epicName: string,
  dayMarker: DayMarker,
  ownerEmail: string,
  daysSinceLaunch: number
): Promise<void> {
  // This will be called by the job which handles actual notification sending
  // For now, just log
  console.log(`Retro reminder: Epic ${epicName} (${epicId}) - T+${dayMarker} retro due. Owner: ${ownerEmail}. Days since launch: ${daysSinceLaunch}`);
}

