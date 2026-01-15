# Jira Epic Key Discovery Methodology

This document describes how ClearGO discovers Jira epic keys for epics to enable the "open tickets in Jira" data source functionality.

## Overview

When a criterion has a `jira_jql` data source type, ClearGO needs to find the corresponding Jira epic key to build the Jira URL. The system uses a two-step methodology:

1. **Primary Method**: Search Jira API by epic name
2. **Fallback Method**: Extract from AHA integrations field

## Primary Method: Jira API Search

### How It Works

1. When an epic is loaded in the CommentsModal (or when the Jira epic key endpoint is called), the system:
   - Takes the epic name from the database
   - Searches Jira using multiple strategies (in order):
     - **Strategy 1**: Exact match: `issueType = Epic AND summary = "{epic_name}"`
     - **Strategy 2**: Case-insensitive contains: `issueType = Epic AND summary ~ "{epic_name}"`
       - Filters results to find exact matches (case-insensitive)
       - Falls back to first partial match if no exact match found
   - Trims whitespace from epic name before searching
   - Returns the first matching epic's key

2. **Advantages**:
   - Most reliable method - directly queries Jira
   - Works even if AHA integrations field is not populated
   - Ensures the epic exists in Jira
   - Uses configured Jira credentials
   - Handles case sensitivity and whitespace differences
   - Multiple search strategies increase match probability

3. **Requirements**:
   - Jira integration must be configured (domain, email, API token)
   - Epic name should match (exact or case-insensitive) in Jira
   - Jira API must be accessible
   - API token must have permissions to search issues

### Implementation

- **API Endpoint**: `GET /api/epics/[id]/jira-epic-key`
- **Jira Client Function**: `searchJiraEpicsByName()` in `src/lib/jira/client.ts`
- **Search Query**: Exact match on epic summary/name

## Fallback Method: AHA Integrations Field

### How It Works

1. If the Jira API search doesn't find a match, the system:
   - Extracts the `integrations` field from the epic's `aha_fields.standard_fields`
   - Parses the integrations data (can be array, object, or string)
   - Searches for Jira epic key patterns like `DEV-123` or `DEV 123`
   - Returns the first valid epic key found

2. **Advantages**:
   - Works offline (no API call needed)
   - Fast (no network latency)
   - Uses data already synced from AHA

3. **Limitations**:
   - Requires AHA integrations field to be populated
   - Depends on AHA sync including the integrations field
   - May not reflect current Jira state

### Implementation

- **Extractor Function**: `extractJiraEpicKeyFromIntegrations()` in `src/lib/jira/epic-key-extractor.ts`
- **Pattern Matching**: Supports formats like:
  - `DEV-123` (canonical format)
  - `DEV 123` (spaced format)
  - `DEV_123` (underscore format)

## Usage in Criteria

When a criterion has a `jira_jql` data source:

1. The system fetches the Jira epic key using the methodology above
2. The JQL template (e.g., `parent = {{JIRA_EPIC}} and statusCategory != Done`) is populated
3. A Jira URL is built: `https://{jira_domain}/issues?jql={populated_jql}`
4. The URL is displayed in the CommentsModal for easy access

## Configuration

### Required Settings

For the primary method to work, configure in **Settings > Integrations > Jira**:

- **Jira Domain**: e.g., `clearco.atlassian.net`
- **Jira Email**: Email associated with API token
- **Jira API Token**: API token from Atlassian account settings

### AHA Sync Requirements

For the fallback method to work:

- AHA sync must include the `integrations` field
- The `getReleaseEpics()` function requests `integrations` field (already implemented)
- Epics synced from releases will have integrations data available

## Error Handling

- If Jira integration is not configured: Returns `null` with error message
- If Jira API search fails: Falls back to integrations field extraction
- If both methods fail: Returns `null` and displays helpful message to user
- Network errors: Logged but don't block the UI

## Future Enhancements

Potential improvements:

1. **Caching**: Store Jira epic keys in database after successful lookup
2. **Fuzzy Matching**: Support partial name matching if exact match fails
3. **Multiple Matches**: Handle cases where multiple Jira epics match the name
4. **Manual Override**: Allow users to manually set Jira epic key if auto-discovery fails
