import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authGuard";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ usuario: null });
  return NextResponse.json({ usuario: user });
}
