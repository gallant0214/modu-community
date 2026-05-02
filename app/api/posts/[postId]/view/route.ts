import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { invalidateCache } from "@/app/lib/cache";
import { waitUntil } from "@vercel/functions";

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
  // 최신/인기 게시글 리스트가 60초 캐시되어 view 가 올라도 옛 카운트 표시.
  // 응답 후에도 백그라운드에서 캐시 무효화가 끝날 때까지 함수가 살아있도록 waitUntil.
  // (fire-and-forget 으로는 serverless 종료 시 중단되어 무효화가 안 됨)
  waitUntil(
    Promise.allSettled([
      invalidateCache("posts:latest:*"),
      invalidateCache("posts:popular:*"),
    ]),
  );
  return NextResponse.json({ success: true });
}
