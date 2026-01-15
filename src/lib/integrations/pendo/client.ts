/**
 * Pendo API Client
 * Handles authentication and API calls to Pendo
 */

interface PendoConfig {
  apiKey: string;
  environment?: string;
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
        const errorJson = await response.json();
        errorText = errorJson.message || errorJson.error || JSON.stringify(errorJson);
      } catch {
        errorText = await response.text();
      }
      const error = new Error(`Pendo API error: ${response.status} ${response.statusText} - ${errorText}`);
      (error as any).status = response.status;
      throw error;
    }

    return response.json();
  }

  /**
   * Get count of events for a given event ID and date range
   */
  async getEventCount(params: PendoEventCountParams): Promise<number> {
    try {
      // Pendo API endpoint for event counts
      // Note: This is a placeholder - actual Pendo API structure may differ
      const response = await this.request('/events/count', {
        method: 'POST',
        body: JSON.stringify({
          eventId: params.eventId,
          startDate: params.startDate,
          endDate: params.endDate,
          filters: params.filters || {},
        }),
      });

      return response.count || 0;
    } catch (error: any) {
      console.error('Error fetching Pendo event count:', error);
      throw error;
    }
  }

  /**
   * Get percentage of users who triggered an event
   */
  async getEventPercentage(params: PendoEventCountParams): Promise<number> {
    try {
      // Pendo API endpoint for event percentages
      const response = await this.request('/events/percentage', {
        method: 'POST',
        body: JSON.stringify({
          eventId: params.eventId,
          startDate: params.startDate,
          endDate: params.endDate,
          filters: params.filters || {},
        }),
      });

      return response.percentage || 0;
    } catch (error: any) {
      console.error('Error fetching Pendo event percentage:', error);
      throw error;
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
   * NOTE: This uses a placeholder endpoint/shape; adjust to match your Pendo setup.
   */
  async getSegments(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.request('/segments', {
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

      return segments;
    } catch (error: any) {
      console.error('Error fetching Pendo segments:', error);
      return [];
    }
  }

  /**
   * Get list of Pendo apps (products).
   * NOTE: This uses a placeholder endpoint/shape; adjust to match your Pendo setup.
   */
  async getApps(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.request('/apps', {
        method: 'GET',
      });

      const apps: Array<{ id: string; name: string }> = [];

      const source = Array.isArray(response)
        ? response
        : Array.isArray((response as any)?.apps)
          ? (response as any).apps
          : [];

      for (const item of source) {
        if (!item) continue;
        const id = item.id || item.guid || item.key;
        const name = item.name || item.label || item.description;
        if (!id || !name) continue;
        apps.push({ id: String(id), name: String(name) });
      }

      return apps;
    } catch (error: any) {
      console.error('Error fetching Pendo apps:', error);
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

