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
      const errorText = await response.text();
      throw new Error(`Pendo API error: ${response.status} ${response.statusText} - ${errorText}`);
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
   * Test connection to Pendo API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Simple health check endpoint
      await this.request('/health', { method: 'GET' });
      return true;
    } catch (error) {
      console.error('Pendo connection test failed:', error);
      return false;
    }
  }
}

