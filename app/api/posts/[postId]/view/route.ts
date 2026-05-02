import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const { error } = await supabase.rpc("increment_post_views", {
    p_id: Number(postId),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // 최신/인기 게시글 리스트는 60초 캐시 — view 증가 후에도 리스트엔 옛 카운트.
  // 캐시 무효화로 다음 조회 시 fresh fetch.
  invalidateCache("posts:latest:*").catch(() => {});
  invalidateCache("posts:popular:*").catch(() => {});
  return NextResponse.json({ success: true });
}
