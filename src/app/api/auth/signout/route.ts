import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set({
    name: "lr_session",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: 0,
  });
  return res;
}
