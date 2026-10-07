import { NextResponse } from "next/server";
import { supabaseServerSession } from "@/lib/supabaseServerSession";

export async function POST() {
  const sessionClient = await supabaseServerSession();
  await sessionClient.auth.signOut();
  return NextResponse.json({ ok: true });
}
