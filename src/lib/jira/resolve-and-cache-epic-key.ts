import type { SupabaseClient } from '@supabase/supabase-js';
import { extractJiraEpicKeyFromIntegrations } from '@/lib/jira/epic-key-extractor';
import { searchJiraEpicsByName } from '@/lib/jira/client';
import { getSettings } from '@/lib/settings-db';
import { getEpic } from '@/lib/aha/client';

export type JiraEpicKeySource = 'cached' | 'integrations' | 'jira_search' | null;

export interface ResolveResult {
  jiraEpicKey: string | null;
  source: JiraEpicKeySource;
}

/** Epic shape needed for resolution (id, name, aha_id, aha_fields, optional cached key). */
export interface EpicForResolution {
  id: string;
  name: string | null;
  aha_id: string | null;
  aha_fields?: Record<string, unknown> | null;
  jira_epic_key?: string | null;
}

/**
 * Resolve Jira epic key for an epic (Aha integrations then Jira search) and cache it in the DB.
 * Call this when an epic is created or updated so the key is available without a separate request.
 */
export async function resolveAndCacheJiraEpicKey(
  epic: EpicForResolution,
  supabase: SupabaseClient
): Promise<ResolveResult> {
  if (epic.jira_epic_key) {
    return { jiraEpicKey: epic.jira_epic_key, source: 'cached' };
  }

  let foundJiraEpicKey: string | null = null;
  let source: JiraEpicKeySource = null;

  const ahaFieldsStruct = epic.aha_fields as Record<string, unknown> | undefined;
  const standardFields = (ahaFieldsStruct?.standard_fields as Record<string, unknown>) || {};
  const integrations = standardFields.integrations;
  if (integrations) {
    const key = extractJiraEpicKeyFromIntegrations(integrations);
    if (key) {
      foundJiraEpicKey = key;
      source = 'integrations';
    }
  }
  if (!foundJiraEpicKey && epic.aha_id) {
    try {
      const ahaEpic = await getEpic(epic.aha_id);
      const integrationsFromAha = ahaEpic?.integrations;
      const toExtract =
        integrationsFromAha && typeof integrationsFromAha === 'object' && 'integrations' in integrationsFromAha
          ? (integrationsFromAha as { integrations?: unknown }).integrations
          : integrationsFromAha;
      if (toExtract) {
        const key = extractJiraEpicKeyFromIntegrations(toExtract);
        if (key) {
          foundJiraEpicKey = key;
          source = 'integrations';
        }
      }
      if (!foundJiraEpicKey && ahaEpic) {
        const fromStringified = extractJiraEpicKeyFromIntegrations(JSON.stringify(ahaEpic));
        if (fromStringified) {
          foundJiraEpicKey = fromStringified;
          source = 'integrations';
        }
      }
    } catch {
      // Ignore Aha API errors
    }
  }
  const settings = await getSettings();
  const jiraConfigured = !!(settings.jira_domain && settings.jira_email && settings.jira_api_token);
  if (!foundJiraEpicKey && epic.name && jiraConfigured) {
    try {
      const jiraEpics = await searchJiraEpicsByName(epic.name);
      if (jiraEpics.length > 0) {
        foundJiraEpicKey = jiraEpics[0].key;
        source = 'jira_search';
      }
    } catch {
      // Ignore Jira API errors
    }
  }

  if (foundJiraEpicKey) {
    try {
      await supabase
        .from('epic')
        .update({ jira_epic_key: foundJiraEpicKey, updated_at: new Date().toISOString() })
        .eq('id', epic.id);
    } catch {
      // Don't fail resolution if cache update fails
    }
  }

  return { jiraEpicKey: foundJiraEpicKey, source };
}
