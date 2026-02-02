/**
 * Pendo API Client
 * Handles authentication and API calls to Pendo
 */

interface PendoConfig {
  apiKey: string;
  environment?: string;
}

// ============================================================================
// Pendo Feature Types
// ============================================================================

export interface PendoFeature {
  id: string;
  name: string;
  appId: string;
  kind: string; // 'Feature', 'Page', etc.
  color: string | null;
  group: string | null;
  createdByUser: {
    id: string;
    username: string;
    first: string;
    last: string;
  } | null;
  createdAt: number | null;
  lastUpdatedByUser: {
    id: string;
    username: string;
  } | null;
  lastUpdatedAt: number | null;
  dirty: boolean;
  // CSS/DOM selectors for the feature tag
  eventPropertyConfigurations: Array<{
    name: string;
    selector: string;
    parsedSelector: string;
    type: string;
  }>;
  elementPathRules: string[];
  pageId: string | null;
}

interface PendoEventCountParams {
  eventId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  filters?: Record<string, any>;
}

interface PendoActivationParams {
  epicId: string;
  launchDate: string; // YYYY-MM-DD
  horizons: number[]; // [30, 60, 90]
}

export class PendoClient {
  private apiKey: string;
  private baseUrl: string;
  private environment: string;

  constructor(config: PendoConfig) {
    this.apiKey = config.apiKey;
    this.environment = config.environment || 'prod';
    // Pendo API base URL - adjust if needed
    this.baseUrl = 'https://app.pendo.io/api/v1';
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Pendo-Integration-Key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorText: string;
      try {
        // Clone response to allow reading body multiple times if needed
        const errorClone = response.clone();
        try {
          const errorJson = await errorClone.json();
          errorText = errorJson.message || errorJson.error || JSON.stringify(errorJson);
        } catch {
          errorText = await response.text();
        }
      } catch (err) {
        errorText = `Status: ${response.status} ${response.statusText}`;
      }
      const error = new Error(`Pendo API error: ${response.status} ${response.statusText} - ${errorText}`);
      (error as any).status = response.status;
      throw error;
    }

    return response.json();
  }

  /**
   * Get count of events for a given event ID and date range.
   * Handles both Feature IDs and Track Event names using the unified 'events' source.
   */
  async getEventCount(params: PendoEventCountParams): Promise<number> {
    try {
      const isFeature = !params.eventId.includes('.');
      const pipeline: any[] = [
        { 
          source: { 
            events: null,
            timeSeries: {
              period: 'dayRange',
              first: 'now()',
              count: -30 // Last 30 days by default
            }
          } 
        }
      ];

      // Filter by type and ID
      if (isFeature) {
        pipeline.push({ filter: `type == "feature" && featureId == "${params.eventId}"` });
      } else {
        pipeline.push({ filter: `type == "track" && trackType == "${params.eventId}"` });
      }

      // Filter by date range (if provided, otherwise timeSeries handles it)
      if (params.startDate && params.endDate) {
        pipeline.push({
          filter: `browserTime >= ${new Date(params.startDate).getTime()} && browserTime < ${new Date(params.endDate).getTime() + 86400000}`,
        });
      }

      if (params.filters?.segmentId) {
        pipeline.push({
          identified: 'visitorId',
          segment: { id: params.filters.segmentId },
        });
      }

      pipeline.push({ count: null });

      const response = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline },
        }),
      });

      const results = Array.isArray(response) ? response : (response?.results || []);
      if (results.length > 0) {
        return Number(results[0].count) || 0;
      }
      return typeof response === 'number' ? response : (response?.count || 0);
    } catch (error: any) {
      console.error('Error fetching Pendo event count:', error);
      return 0;
    }
  }

  /**
   * Get unique visitors for a given event ID and date range.
   */
  async getUniqueVisitors(params: PendoEventCountParams): Promise<number> {
    try {
      const isFeature = !params.eventId.includes('.');
      const pipeline: any[] = [
        { 
          source: { 
            events: null,
            timeSeries: {
              period: 'dayRange',
              first: 'now()',
              count: -30
            }
          } 
        }
      ];

      if (isFeature) {
        pipeline.push({ filter: `type == "feature" && featureId == "${params.eventId}"` });
      } else {
        pipeline.push({ filter: `type == "track" && trackType == "${params.eventId}"` });
      }

      if (params.startDate && params.endDate) {
        pipeline.push({
          filter: `browserTime >= ${new Date(params.startDate).getTime()} && browserTime < ${new Date(params.endDate).getTime() + 86400000}`,
        });
      }

      if (params.filters?.segmentId) {
        pipeline.push({
          identified: 'visitorId',
          segment: { id: params.filters.segmentId },
        });
      }

      pipeline.push({ group: { group: ['visitorId'] } });
      pipeline.push({ count: null });

      const response = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline },
        }),
      });

      const results = Array.isArray(response) ? response : (response?.results || []);
      if (results.length > 0) {
        return Number(results[0].count) || 0;
      }
      return typeof response === 'number' ? response : (response?.count || 0);
    } catch (error: any) {
      console.error('Error fetching Pendo unique visitors:', error);
      return 0;
    }
  }

  /**
   * Get total unique visitors in a segment (or all) for a date range.
   * Uses the events source with date filtering to count unique visitors.
   */
  async getTotalUniqueVisitors(params: { startDate: string; endDate: string; segmentId?: string }): Promise<number> {
    try {
      // Calculate days between dates for timeSeries count
      const start = new Date(params.startDate);
      const end = new Date(params.endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const pipeline: any[] = [
        { 
          source: { 
            events: null,
            timeSeries: {
              period: 'dayRange',
              first: `date("${params.endDate}")`,
              count: -daysDiff
            }
          } 
        }
      ];

      // Filter by segment if provided
      if (params.segmentId) {
        pipeline.push({
          segment: { id: params.segmentId },
        });
      }

      // Group by visitor and count unique visitors
      pipeline.push({ group: { group: ['visitorId'] } });
      pipeline.push({ count: null });

      const response = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline },
        }),
      });

      const results = Array.isArray(response) ? response : (response?.results || []);
      if (results.length > 0) {
        return Number(results[0].count) || 0;
      }
      return typeof response === 'number' ? response : (response?.count || 0);
    } catch (error: any) {
      console.error('Error fetching Pendo total unique visitors:', error);
      return 0;
    }
  }

  /**
   * Get percentage of users who triggered an event.
   */
  async getEventPercentage(params: PendoEventCountParams): Promise<number> {
    try {
      const [eventCount, totalCount] = await Promise.all([
        this.getUniqueVisitors(params),
        this.getTotalUniqueVisitors({
          startDate: params.startDate,
          endDate: params.endDate,
          segmentId: params.filters?.segmentId
        })
      ]);

      if (totalCount === 0) return 0;
      return (eventCount / totalCount) * 100;
    } catch (error: any) {
      console.error('Error fetching Pendo event percentage:', error);
      return 0;
    }
  }

  /**
   * Get activation data for an epic at different time horizons
   */
  async getActivationData(params: PendoActivationParams): Promise<number[]> {
    try {
      const launchDate = new Date(params.launchDate);
      const activations: number[] = [];

      for (const horizon of params.horizons) {
        const horizonDate = new Date(launchDate);
        horizonDate.setDate(horizonDate.getDate() + horizon);
        
        const endDate = new Date();
        if (horizonDate > endDate) {
          // Horizon is in the future, return null/0
          activations.push(0);
          continue;
        }

        // Calculate activation percentage for this horizon
        // This is a placeholder - actual implementation depends on Pendo API
        const response = await this.request('/activation', {
          method: 'POST',
          body: JSON.stringify({
            epicId: params.epicId,
            launchDate: params.launchDate,
            horizonDays: horizon,
          }),
        });

        activations.push(response.activationPercentage || 0);
      }

      return activations;
    } catch (error: any) {
      console.error('Error fetching Pendo activation data:', error);
      throw error;
    }
  }

  /**
   * Get list of all events from Pendo using the Aggregation API
   * Returns event names (not IDs) as the primary identifier
   */
  async getEvents(): Promise<Array<{ name: string; id?: string; description?: string }>> {
    try {
      // Use Pendo Aggregation API to get all Track Events
      // POST /api/v1/aggregation with trackTypes source set to null
      const response = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: {
            mimeType: 'application/json',
          },
          request: {
            pipeline: [
              {
                source: {
                  trackTypes: null,
                },
              },
            ],
          },
        }),
      });

      // Extract track types from the Aggregation API response
      // The response structure may vary, so we handle multiple possible formats
      let trackTypes: any[] = [];
      
      if (Array.isArray(response)) {
        trackTypes = response;
      } else if (response.results && Array.isArray(response.results)) {
        trackTypes = response.results;
      } else if (response.data && Array.isArray(response.data)) {
        trackTypes = response.data;
      } else if (response.trackTypes && Array.isArray(response.trackTypes)) {
        trackTypes = response.trackTypes;
      } else if (response.items && Array.isArray(response.items)) {
        trackTypes = response.items;
      } else {
        // Try to find array in nested structure
        const findArray = (obj: any): any[] => {
          if (Array.isArray(obj)) return obj;
          if (obj && typeof obj === 'object') {
            for (const key in obj) {
              const found = findArray(obj[key]);
              if (found.length > 0) return found;
            }
          }
          return [];
        };
        trackTypes = findArray(response);
      }

      // Filter out null/undefined track types and map to our format
      const validEvents: Array<{ name: string; id?: string; description?: string }> = [];
      
      for (const trackType of trackTypes) {
        if (!trackType || trackType === null || trackType === undefined) {
          continue;
        }
        
        // Extract event name - track types should have 'name' field
        const name = trackType.name || trackType.eventName || trackType.event || trackType.value || trackType.id || trackType.eventId || trackType.key || '';
        
        // Only include events with a valid name
        if (!name || name.trim() === '') {
          continue;
        }

        validEvents.push({
          name: name.trim(),
          id: trackType.id || trackType.eventId || trackType.key || name.trim(),
          description: trackType.description || trackType.eventDescription || trackType.desc || '',
        });
      }

      console.log(`Fetched ${validEvents.length} Pendo events from ${trackTypes.length} track types`);
      if (validEvents.length === 0 && trackTypes.length > 0) {
        console.log('Sample track type structure:', JSON.stringify(trackTypes[0], null, 2));
      }
      if (validEvents.length === 0) {
        console.log('Full Aggregation API response structure:', JSON.stringify(response, null, 2));
      }
      return validEvents;
    } catch (error: any) {
      console.error('Error fetching Pendo events via Aggregation API:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        response: error.response,
      });
      // If the endpoint doesn't exist or fails, return empty array
      // This allows the form to still work with manual entry
      return [];
    }
  }

  /**
   * Get list of Pendo segments.
   * Uses the documented segment listing endpoint.
   */
  async getSegments(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Per Pendo docs, segments are listed via /segment
      const response = await this.request('/segment', {
        method: 'GET',
      });

      const segments: Array<{ id: string; name: string }> = [];

      const source = Array.isArray(response)
        ? response
        : Array.isArray((response as any)?.segments)
          ? (response as any).segments
          : [];

      for (const item of source) {
        if (!item) continue;
        const id = item.id || item.guid || item.key;
        const name = item.name || item.label || item.description;
        if (!id || !name) continue;
        segments.push({ id: String(id), name: String(name) });
      }

      console.log(
        '[PendoClient] getSegments: rawCount=%d filteredCount=%d',
        Array.isArray(source) ? source.length : 0,
        segments.length
      );
      if (segments.length > 0) {
        console.log('[PendoClient] getSegments: sampleSegment=%o', segments[0]);
      }

      return segments;
    } catch (error: any) {
      console.error('Error fetching Pendo segments:', error);
      return [];
    }
  }

  /**
   * Get list of Pendo feature tags.
   * These are UI elements tagged in Pendo's Visual Design Studio.
   * Features track clicks and can be used for engagement/adoption metrics.
   */
  async getFeatures(): Promise<PendoFeature[]> {
    try {
      // Use ?expand=* to get features across all applications
      const response = await this.request('/feature?expand=*', {
        method: 'GET',
      });

      const source: any[] = Array.isArray(response) ? response : [];
      const features: PendoFeature[] = [];

      for (const item of source) {
        if (!item) continue;
        
        const id = item.id || item.featureId;
        const name = item.name || item.displayName;
        const appId = item.appId || item.applicationId;
        
        if (!id || !name) continue;

        features.push({
          id: String(id),
          name: String(name),
          appId: appId ? String(appId) : '',
          kind: item.kind || 'Feature',
          color: item.color || null,
          group: item.group || item.featureGroup || null,
          createdByUser: item.createdByUser || null,
          createdAt: item.createdAt || null,
          lastUpdatedByUser: item.lastUpdatedByUser || null,
          lastUpdatedAt: item.lastUpdatedAt || null,
          dirty: item.dirty || false,
          eventPropertyConfigurations: item.eventPropertyConfigurations || [],
          elementPathRules: item.elementPathRules || [],
          pageId: item.pageId || null,
        });
      }

      console.log(
        '[PendoClient] getFeatures: rawCount=%d filteredCount=%d',
        source.length,
        features.length
      );
      if (features.length > 0) {
        console.log('[PendoClient] getFeatures: sampleFeature=%o', {
          id: features[0].id,
          name: features[0].name,
          appId: features[0].appId,
          kind: features[0].kind,
        });
      }

      return features;
    } catch (error: any) {
      console.error('Error fetching Pendo features:', error);
      return [];
    }
  }

  /**
   * Get list of Pendo apps (products).
   *
   * Pendo does not expose a first-class "apps" listing endpoint in v1.
   * Instead, we infer the set of applications by expanding features across
   * all apps and aggregating distinct appIds.
   */
  async getApps(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Reuse getFeatures to avoid duplicate API call
      const features = await this.getFeatures();

      const appMap = new Map<string, string>();

      for (const feature of features) {
        if (!feature.appId) continue;

        const key = String(feature.appId);
        if (!appMap.has(key)) {
          // Default label is a generic name; API route can override from settings
          appMap.set(key, `App ${key}`);
        }
      }

      const apps: Array<{ id: string; name: string }> = Array.from(appMap.entries()).map(
        ([id, name]) => ({ id, name })
      );

      console.log(
        '[PendoClient] getApps: featureCount=%d appCount=%d',
        features.length,
        apps.length
      );
      if (apps.length > 0) {
        console.log('[PendoClient] getApps: sampleApp=%o', apps[0]);
      }

      return apps;
    } catch (error: any) {
      console.error('Error fetching Pendo apps:', error);
      return [];
    }
  }

  /**
   * Get click count for a specific feature within a date range.
   * Uses the unified 'events' source for more robust querying.
   */
  async getFeatureClickCount(params: {
    featureId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    segmentId?: string;
    appId?: string;
  }): Promise<{ totalClicks: number; uniqueVisitors: number }> {
    try {
      const basePipeline: any[] = [
        { 
          source: { 
            events: null,
            timeSeries: {
              period: 'dayRange',
              first: 'now()',
              count: -30
            }
          } 
        },
        { filter: `type == "feature" && featureId == "${params.featureId}"` },
      ];

      if (params.startDate && params.endDate) {
        basePipeline.push({
          filter: `browserTime >= ${new Date(params.startDate).getTime()} && browserTime < ${new Date(params.endDate).getTime() + 86400000}`,
        });
      }

      if (params.segmentId) {
        basePipeline.push({
          identified: 'visitorId',
          segment: { id: params.segmentId },
        });
      }

      const extractCount = (res: any) => {
        const results = Array.isArray(res) ? res : (res?.results || []);
        if (results.length > 0) return Number(results[0].count) || 0;
        return typeof res === 'number' ? res : (res?.count || 0);
      };

      // 1. Total Clicks
      const totalPipeline = [...basePipeline, { count: null }];
      const response = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline: totalPipeline },
        }),
      });

      // 2. Unique Visitors
      const uniquePipeline = [...basePipeline, { group: { group: ['visitorId'] } }, { count: null }];
      const uniqueResponse = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline: uniquePipeline },
        }),
      });

      return { 
        totalClicks: extractCount(response), 
        uniqueVisitors: extractCount(uniqueResponse) 
      };
    } catch (error: any) {
      console.error('Error fetching feature click count:', error);
      return { totalClicks: 0, uniqueVisitors: 0 };
    }
  }

  /**
   * Get visitors in a segment who have NOT clicked a specific feature.
   * This is crucial for the Happiness automation - finding users who should
   * be using a feature but aren't.
   */
  async getSegmentNonUsers(params: {
    segmentId: string;
    featureId: string;
    startDate: string;
    endDate: string;
    limit?: number;
  }): Promise<Array<{ visitorId: string; accountId?: string }>> {
    try {
      // First, get all visitors in the segment
      const segmentVisitorsPipeline = [
        {
          source: {
            visitors: null,
            timeSeries: {
              period: 'dayRange',
              first: 'now()',
              count: -30
            }
          },
        },
        {
          identified: 'visitorId',
          segment: { id: params.segmentId },
        },
        {
          select: { visitorId: 'visitorId', accountId: 'accountId' },
        },
      ];

      const segmentVisitors = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline: segmentVisitorsPipeline },
        }),
      });

      // Next, get visitors who HAVE clicked the feature
      const featureUsersPipeline = [
        {
          source: {
            events: null,
            timeSeries: {
              period: 'dayRange',
              first: 'now()',
              count: -30
            }
          },
        },
        {
          filter: `type == "feature" && featureId == "${params.featureId}"`,
        },
      ];

      if (params.startDate && params.endDate) {
        featureUsersPipeline.push({
          filter: `browserTime >= ${new Date(params.startDate).getTime()} && browserTime < ${new Date(params.endDate).getTime() + 86400000}`,
        });
      }

      featureUsersPipeline.push(
        {
          group: { group: ['visitorId'] },
        },
        {
          select: { visitorId: 'visitorId' },
        }
      );

      const featureUsers = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: { mimeType: 'application/json' },
          request: { pipeline: featureUsersPipeline },
        }),
      });

      // Find the difference: segment visitors who haven't used the feature
      const featureUserIds = new Set(
        (Array.isArray(featureUsers) ? featureUsers : featureUsers?.results || [])
          .map((u: any) => u.visitorId)
      );

      const segmentVisitorList = Array.isArray(segmentVisitors) 
        ? segmentVisitors 
        : segmentVisitors?.results || [];

      const nonUsers = segmentVisitorList
        .filter((v: any) => !featureUserIds.has(v.visitorId))
        .slice(0, params.limit || 100)
        .map((v: any) => ({
          visitorId: v.visitorId,
          accountId: v.accountId || undefined,
        }));

      console.log(
        '[PendoClient] getSegmentNonUsers: segmentSize=%d featureUsers=%d nonUsers=%d',
        segmentVisitorList.length,
        featureUserIds.size,
        nonUsers.length
      );

      return nonUsers;
    } catch (error: any) {
      console.error('Error fetching segment non-users:', error);
      return [];
    }
  }

  /**
   * Test connection to Pendo API
   * Uses the aggregation API endpoint to verify connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test connection by making a minimal aggregation API call
      // This endpoint exists and will return an error if auth fails, or data if successful
      const response = await this.request('/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          response: {
            mimeType: 'application/json',
          },
          request: {
            pipeline: [
              {
                source: {
                  trackTypes: null,
                },
              },
            ],
          },
        }),
      });
      
      // If we get a response (even if empty), the connection works
      // The response structure doesn't matter for a connection test
      return true;
    } catch (error: any) {
      console.error('Pendo connection test failed:', error);
      // Re-throw the error so the caller can see the specific error message
      // This allows for better error handling in the API route
      throw error;
    }
  }
}

