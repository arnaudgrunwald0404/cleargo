import { NextRequest, NextResponse } from "next/server";

const CLEARMAP_API_URL = "https://dqqzbkmtbnigytsfycbz.supabase.co/functions/v1/epic-talk-track-api";

export async function GET(request: NextRequest) {
  const epicId = request.nextUrl?.searchParams?.get("epic_id") ?? null;
  if (!epicId || typeof epicId !== "string" || !epicId.trim()) {
    return NextResponse.json(
      { error: "Missing epic_id query parameter" },
      { status: 400 }
    );
  }

  const jwt = process.env.CLEARMAP_JWT;
  const apikey = process.env.CLEARMAP_SUPABASE_ANON_KEY;

  if (!jwt || !apikey) {
    return NextResponse.json(
      { error: "Talk track integration not configured", configured: false },
      { status: 503 }
    );
  }

  try {
    const url = `${CLEARMAP_API_URL}?epic_id=${encodeURIComponent(epicId.trim())}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey,
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = data?.error || data?.message || "Talk track API error";
      const detail = data?.detail || data?.error_description || (typeof data?.error === "string" ? data.error : undefined);
      return NextResponse.json(
        {
          error: message,
          status: res.status,
          detail: detail || (res.status === 404 ? "No talk track found for this epic." : `Upstream returned ${res.status}.`),
        },
        { status: res.status >= 500 ? 503 : res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[talk-track] proxy error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch talk track data",
        status: 503,
        detail: message,
      },
      { status: 503 }
    );
  }
}

