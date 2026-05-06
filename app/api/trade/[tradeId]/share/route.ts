import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/trade/[tradeId]/share — 공유 카운트 +1
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const { tradeId } = await params;
  const id = Number(tradeId);

  const { data: post } = await supabase
    .from("trade_posts")
    .select("share_count")
    .eq("id", id)
    .single();

  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });

  const next = (post.share_count ?? 0) + 1;
  const { error } = await supabase
    .from("trade_posts")
    .update({ share_count: next })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ share_count: next });
}
