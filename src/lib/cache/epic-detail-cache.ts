// In-memory cache for epic detail page frequently accessed data

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class EpicDetailCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    
    // TTLs in milliseconds
    private readonly TTL_SETTINGS = 5 * 60 * 1000; // 5 minutes
    private readonly TTL_CRITERIA = 10 * 60 * 1000; // 10 minutes
    private readonly TTL_LAUNCH_STAGES = 30 * 60 * 1000; // 30 minutes
    private readonly TTL_RELEASE_SCHEDULE = 5 * 60 * 1000; // 5 minutes

    private isExpired(entry: CacheEntry<any>, ttl: number): boolean {
        return Date.now() - entry.timestamp > ttl;
    }

    get<T>(key: string, ttl: number): T | null {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        
        if (this.isExpired(entry, ttl)) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.data as T;
    }

    set<T>(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }

    clear(key?: string): void {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    // Convenience methods for specific data types
    getSettings(): any | null {
        return this.get('settings', this.TTL_SETTINGS);
    }

    setSettings(settings: any): void {
        this.set('settings', settings);
    }

    getCriteria(): any[] | null {
        return this.get('criteria', this.TTL_CRITERIA);
    }

    setCriteria(criteria: any[]): void {
        this.set('criteria', criteria);
    }

    getLaunchStages(): any[] | null {
        return this.get('launch_stages', this.TTL_LAUNCH_STAGES);
    }

    setLaunchStages(stages: any[]): void {
        this.set('launch_stages', stages);
    }

    getReleaseSchedule(): any[] | null {
        return this.get('release_schedule', this.TTL_RELEASE_SCHEDULE);
    }

    setReleaseSchedule(schedule: any[]): void {
        this.set('release_schedule', schedule);
    }
}

// Singleton instance
export const epicDetailCache = new EpicDetailCache();

