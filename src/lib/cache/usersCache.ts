/**
 * Users cache utility for fast loading of user lists
 * Uses localStorage to cache user data with expiration
 */

const CACHE_KEY = 'cleargo_users_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedUser {
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

interface CacheData {
  users: CachedUser[];
  timestamp: number;
}

export function getCachedUsers(): CachedUser[] | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CacheData = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is expired
    if (now - data.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data.users;
  } catch (error) {
    console.error('Failed to read users cache:', error);
    return null;
  }
}

export function setCachedUsers(users: CachedUser[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const data: CacheData = {
      users,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to write users cache:', error);
  }
}

export function clearUsersCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}
