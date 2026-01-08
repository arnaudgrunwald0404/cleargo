import { promises as fs } from "fs";
import path from "path";

// In serverless environments (AWS Lambda, Netlify, Vercel), use /tmp instead of project directory
// Check if we're in a serverless environment by checking for common indicators
function isServerlessEnvironment(): boolean {
  // Check environment variables
  if (
    process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    process.env.NETLIFY === "true" ||
    process.env.VERCEL === "1" ||
    process.env.NETLIFY_DEV === "true"
  ) {
    return true;
  }
  
  // Check current working directory path - /var/task is common in AWS Lambda/Netlify
  const cwd = process.cwd();
  if (cwd.includes("/var/task") || cwd.startsWith("/tmp/") || cwd === "/tmp") {
    return true;
  }
  
  return false;
}

const isServerless = isServerlessEnvironment();
// Always use /tmp in serverless environments to avoid read-only filesystem errors
const DATA_DIR = isServerless ? "/tmp" : path.join(process.cwd(), ".data");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

// Global variable to track the actual file path (may change if we detect read-only filesystem)
let actualTokensFile = TOKENS_FILE;

// Helper function to safely read file with EROFS fallback
async function safeReadFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error: any) {
    // If we get EROFS and we're not already using /tmp, switch to /tmp
    if (error.code === "EROFS" && filePath !== "/tmp/tokens.json") {
      actualTokensFile = "/tmp/tokens.json";
      try {
        return await fs.readFile(actualTokensFile, "utf8");
      } catch (fallbackError: any) {
        // If file doesn't exist in /tmp, return empty data
        if (fallbackError.code === "ENOENT") {
          return JSON.stringify({ used: {}, lastSentAt: {} });
        }
        throw fallbackError;
      }
    } else if (error.code === "ENOENT") {
      // File doesn't exist, return empty data
      return JSON.stringify({ used: {}, lastSentAt: {} });
    } else {
      throw error;
    }
  }
}

// Helper function to safely write file with EROFS fallback
async function safeWriteFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content);
  } catch (error: any) {
    // If we get EROFS and we're not already using /tmp, switch to /tmp
    if (error.code === "EROFS" && filePath !== "/tmp/tokens.json") {
      actualTokensFile = "/tmp/tokens.json";
      try {
        await fs.writeFile(actualTokensFile, content);
      } catch (fallbackError: any) {
        console.error(`Failed to write token store to ${actualTokensFile}:`, fallbackError.message);
        throw new Error(`Cannot write to token store. Filesystem is read-only.`);
      }
    } else {
      throw error;
    }
  }
}

async function ensureStore() {
  try {
    // Try to create directory if it doesn't exist (will fail silently if it exists)
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error: any) {
      // Ignore EEXIST errors (directory already exists)
      if (error.code !== "EEXIST") {
        // If we get EROFS (read-only filesystem), switch to /tmp
        if (error.code === "EROFS" && actualTokensFile !== "/tmp/tokens.json") {
          actualTokensFile = "/tmp/tokens.json";
          // /tmp should always exist, but try to ensure it
          try {
            await fs.mkdir("/tmp", { recursive: true });
          } catch {
            // /tmp should exist, ignore errors
          }
        } else if (error.code !== "EROFS") {
          throw error;
        }
      }
    }
    
    // Check if file exists
    try {
      await fs.access(actualTokensFile);
    } catch {
      // File doesn't exist, create it
      await safeWriteFile(actualTokensFile, JSON.stringify({ used: {}, lastSentAt: {} }, null, 2));
    }
  } catch (error: any) {
    // Final fallback: if we still have EROFS and not using /tmp, try /tmp
    if (error.code === "EROFS" && actualTokensFile !== "/tmp/tokens.json") {
      actualTokensFile = "/tmp/tokens.json";
      try {
        await safeWriteFile(actualTokensFile, JSON.stringify({ used: {}, lastSentAt: {} }, null, 2));
      } catch (fallbackError: any) {
        console.error(`Failed to initialize token store at ${actualTokensFile}:`, fallbackError.message);
        throw new Error(`Cannot write to token store. Filesystem is read-only and /tmp is not available.`);
      }
    } else {
      console.error(`Failed to initialize token store at ${actualTokensFile}:`, error.message);
      throw error;
    }
  }
}

export async function markTokenUsed(jti: string) {
  await ensureStore();
  const raw = await safeReadFile(actualTokensFile);
  const data = JSON.parse(raw) as { used: Record<string, boolean>; lastSentAt: Record<string, number> };
  data.used[jti] = true;
  await safeWriteFile(actualTokensFile, JSON.stringify(data, null, 2));
}

export async function isTokenUsed(jti: string) {
  await ensureStore();
  try {
    const raw = await safeReadFile(actualTokensFile);
    const data = JSON.parse(raw) as { used: Record<string, boolean>; lastSentAt: Record<string, number> };
    return Boolean(data.used[jti]);
  } catch (error: any) {
    // If we can't read it, token is not used
    return false;
  }
}

export async function canSendEmail(email: string, cooldownMs = 60000) {
  await ensureStore();
  const raw = await safeReadFile(actualTokensFile);
  const data = JSON.parse(raw) as { used: Record<string, boolean>; lastSentAt: Record<string, number> };
  const last = data.lastSentAt[email] || 0;
  const now = Date.now();
  if (now - last < cooldownMs) return false;
  data.lastSentAt[email] = now;
  await safeWriteFile(actualTokensFile, JSON.stringify(data, null, 2));
  return true;
}
