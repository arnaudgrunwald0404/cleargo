import { cookies } from "next/headers";
import { verifyToken } from "@/lib/jwt";

export type Session = { email: string } | null;

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("lr_session");
  if (!cookie) return null;
  try {
    const payload = await verifyToken<{ email: string; t: string }>(cookie.value);
    if (payload.t !== "session") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
