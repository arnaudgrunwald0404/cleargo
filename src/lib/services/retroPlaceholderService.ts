/**
 * Service for automatically creating retro placeholders
 * Creates PENDING retros when epics reach T+30, T+60, T+90 days
 */
import { getClient } from '@/lib/db';
import type { DayMarker } from '@/lib/success/types';

export interface RetroPlaceholderResult {
  epicId: string;
  epicName: string;
  dayMarker: DayMarker;
  created: boolean;
  error?: string;
}

/**
 * Calculate days since launch date
 */
function calculateDaysSinceLaunch(launchDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const launch = new Date(launchDate);
  launch.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - launch.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Get day markers that should have placeholders created based on days since launch
 */
function getDayMarkersForPlaceholder(daysSinceLaunch: number): DayMarker[] {
  const markers: DayMarker[] = [];
  
  // Create placeholder if we're at or past the day marker
  if (daysSinceLaunch >= 30) markers.push(30);
  if (daysSinceLaunch >= 60) markers.push(60);
  if (daysSinceLaunch >= 90) markers.push(90);
  
  return markers;
}

/**
 * Create retro placeholders for eligible epics
 */
export async function createRetroPlaceholders(): Promise<RetroPlaceholderResult[]> {
  const supabase = getClient();
  const today = new Date().toISOString().split('T')[0];
  
  // Find epics that are launched and have success configs
  const { data: epics, error: epicsError } = await supabase
    .from('epic')
    .select(`
      id,
      name,
      target_launch_date,
      status
    `)
    .in('status', ['LAUNCHED', 'POST_LAUNCH'])
    .lte('target_launch_date', today)
    .not('target_launch_date', 'is', null);
  
  if (epicsError) {
    console.error('Error fetching epics for retro placeholders:', epicsError);
    throw new Error(`Failed to fetch epics: ${epicsError.message}`);
  }
  
  if (!epics || epics.length === 0) {
    return [];
  }
  
  // Get success configs for these epics
  const epicIds = epics.map(e => e.id);
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select('epic_id')
    .in('epic_id', epicIds);
  
  const configEpicIds = new Set((configs || []).map(c => c.epic_id));
  
  // Get existing retros to avoid duplicates
  const { data: existingRetros } = await supabase
    .from('epic_retros')
    .select('epic_id, day_marker')
    .in('epic_id', epicIds);
  
  const existingRetroKeys = new Set(
    (existingRetros || []).map(r => `${r.epic_id}-${r.day_marker}`)
  );
  
  const results: RetroPlaceholderResult[] = [];
  const placeholdersToCreate: Array<{
    epic_id: string;
    day_marker: DayMarker;
    status: 'PENDING';
  }> = [];
  
  for (const epic of epics) {
    // Only create placeholders for epics with success configs
    if (!configEpicIds.has(epic.id)) continue;
    if (!epic.target_launch_date) continue;
    
    const daysSinceLaunch = calculateDaysSinceLaunch(epic.target_launch_date);
    const dayMarkers = getDayMarkersForPlaceholder(daysSinceLaunch);
    
    for (const dayMarker of dayMarkers) {
      const key = `${epic.id}-${dayMarker}`;
      
      // Skip if retro already exists
      if (existingRetroKeys.has(key)) {
        results.push({
          epicId: epic.id,
          epicName: epic.name,
          dayMarker,
          created: false,
        });
        continue;
      }
      
      placeholdersToCreate.push({
        epic_id: epic.id,
        day_marker: dayMarker,
        status: 'PENDING',
      });
    }
  }
  
  // Batch create placeholders
  if (placeholdersToCreate.length > 0) {
    const { data: created, error: createError } = await supabase
      .from('epic_retros')
      .insert(placeholdersToCreate)
      .select('epic_id, day_marker');
    
    if (createError) {
      console.error('Error creating retro placeholders:', createError);
      // Return error for all attempted creations
      placeholdersToCreate.forEach(p => {
        const epic = epics.find(e => e.id === p.epic_id);
        results.push({
          epicId: p.epic_id,
          epicName: epic?.name || 'Unknown',
          dayMarker: p.day_marker,
          created: false,
          error: createError.message,
        });
      });
    } else {
      // Mark successful creations
      const createdKeys = new Set(
        (created || []).map(r => `${r.epic_id}-${r.day_marker}`)
      );
      
      placeholdersToCreate.forEach(p => {
        const epic = epics.find(e => e.id === p.epic_id);
        const key = `${p.epic_id}-${p.day_marker}`;
        results.push({
          epicId: p.epic_id,
          epicName: epic?.name || 'Unknown',
          dayMarker: p.day_marker,
          created: createdKeys.has(key),
        });
      });
    }
  }
  
  return results;
}

