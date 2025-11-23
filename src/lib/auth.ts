import { cookies } from "next/headers";
import { verifyToken } from "@/lib/jwt";

export type Session = { email: string } | null;

export async function getSession(): Promise<Session> {
  const cookie = cookies().get("lr_session");
  if (!cookie) return null;
  try {
    const payload = await verifyToken<{ email: string; t: string }>(cookie.value);
    if (payload.t !== "session") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
