import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/practical-oral-notice?audience=main|disabled
// 활성 공지 카드 목록 (최신 정보)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience") === "disabled" ? "disabled" : "main";

  const { data, error } = await supabase
    .from("practical_oral_notices")
    .select("id, audience, slug, icon, badge, title, summary, display_order, updated_at")
    .eq("audience", audience)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notices: data || [] });
}
