import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_TABS = new Set(["practical", "community", "jobs", "trade"]);
const VALID_PLATFORMS = new Set(["web", "ios", "android"]);

// POST /api/analytics/tab/enter
// body: { tab_key, platform, session_id }
export async function POST(request: Request) {
  const { tab_key, platform, session_id } = await request.json().catch(() => ({}));
  if (!VALID_TABS.has(tab_key) || !VALID_PLATFORMS.has(platform) || !session_id) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("tab_visits")
    .insert({ tab_key, platform, session_id })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }
  return NextResponse.json({ visit_id: data.id });
}
