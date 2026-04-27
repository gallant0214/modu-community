import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/track-store-click — 스토어 링크 클릭 추적
export async function POST(request: Request) {
  try {
    const { store } = await request.json();
    if (!store || !["google_play", "app_store"].includes(store)) {
      return NextResponse.json({ error: "invalid store" }, { status: 400 });
    }

    const { error } = await supabase.from("store_clicks").insert({ store });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
