import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/posts/notice — 공지 게시글 1개 (is_notice = true, 가장 최근)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*, categories(name)")
      .eq("is_notice", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json(null);

    const { categories: cat, ...rest } = data;
    return NextResponse.json({
      ...rest,
      category_name: cat?.name ?? null,
    });
  } catch {
    return NextResponse.json(null);
  }
}
