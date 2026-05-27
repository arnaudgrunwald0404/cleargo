import { SignJWT } from "jose";

const FEEDBACK_SCRIPT_SRC = "https://cdn.aha.io/assets/feedback/feedback.js";
const SCRIPT_ID = "aha-feedback-widget";

export const AHA_IDEAS_WIDGET_DEFAULT_APPLICATION_ID = "6457569509733897795";
/** Widget record id from Aha portal → Widgets → Custom position sample script. */
export const AHA_IDEAS_WIDGET_DEFAULT_WIDGET_ID = "7642713938828165492";

export type AhaIdeasWidgetUser = {
  id: string;
  name: string;
  email: string;
};

export function getAhaIdeasWidgetAccount(): string {
  return (
    process.env.NEXT_PUBLIC_AHA_IDEAS_WIDGET_ACCOUNT ||
    process.env.AHA_DOMAIN ||
    "clearco"
  );
}

export function getAhaIdeasWidgetApplicationId(): string {
  return (
    process.env.NEXT_PUBLIC_AHA_IDEAS_WIDGET_APPLICATION_ID ||
    AHA_IDEAS_WIDGET_DEFAULT_APPLICATION_ID
  );
}

export function getAhaIdeasWidgetId(): string {
  return process.env.AHA_IDEAS_WIDGET_ID || AHA_IDEAS_WIDGET_DEFAULT_WIDGET_ID;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.AHA_IDEAS_WIDGET_JWT_SECRET;
  if (!secret) {
    throw new Error("AHA_IDEAS_WIDGET_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

/** HS256 JWT for Aha Ideas in-app widget (user identity must be signed server-side). */
export async function createAhaIdeasWidgetJwt(user: AhaIdeasWidgetUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    iat: now,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime("1h")
    .sign(getJwtSecret());
}

export function formatAhaIdeasWidgetUserName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email: string;
}): string {
  const fromParts = [profile.first_name, profile.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  if (fromParts) return fromParts;
  if (profile.name?.trim()) return profile.name.trim();
  return profile.email;
}

/** Install the Aha feedback.js loader queue (safe to call multiple times). */
export function ensureAhaFeedbackLoader(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { aha?: AhaWidgetCommandWithQueue };
  if (w.aha) return;

  const commandName = "aha";
  (w as unknown as Record<string, string>)["aha-widget"] = commandName;
  const stub: AhaWidgetCommandWithQueue = function (...args: unknown[]) {
    stub.q = stub.q || [];
    stub.q.push(args);
  };
  w.aha = stub;
}

type AhaWidgetCommandWithQueue = AhaWidgetCommand & { q?: unknown[][] };

export function loadAhaFeedbackScript(): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Document is not available"));
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Aha Ideas widget script")),
        { once: true }
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = FEEDBACK_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Aha Ideas widget script"));
    document.body.appendChild(script);
  });
}

export function destroyAhaIdeasWidget(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { aha?: AhaWidgetCommand };
  try {
    w.aha?.("destroy");
  } catch {
    // ignore teardown errors
  }
  // Keep feedback.js on window — deleting `aha` breaks remounts (React Strict Mode / client nav).
}

export type AhaWidgetCommand = (...args: unknown[]) => void;

declare global {
  interface Window {
    aha?: AhaWidgetCommand;
  }
}
