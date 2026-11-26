import { cache } from "react";
import { supabase } from "@/app/lib/supabase";
import { pageMeta, toPlainExcerpt } from "@/app/lib/seo";
import { TradeDetailView, type TradePostDetail } from "./trade-detail-view";

// ISR: 60초. 수정·판매완료 등은 클라이언트가 /api/trade/[id] 를 다시 읽어 바로 반영한다.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

const CATEGORY_LABEL: Record<string, string> = { equipment: "운동기구", center: "센터 매매", gear: "스포츠 용품" };

// 목록과 같은 노출 기준(active·reserved·sold). 삭제·숨김 글은 서버에서 싣지 않는다.
const loadTrade = cache(async (rawId: string) => {
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const { data, error } = await supabase
      .from("trade_posts")
      .select("*")
      .eq("id", id)
      .in("status", ["active", "reserved", "sold"])
      .maybeSingle();
    if (error || !data) return null;
    // 작성자 내부 ID 는 HTML 에 싣지 않는다.
    return { ...data, firebase_uid: "", is_bookmarked: false, is_owner: false, is_admin: false } as TradePostDetail;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const post = await loadTrade(id);
  if (!post) return { title: "거래 글을 찾을 수 없습니다", robots: { index: false } };
  const cat = CATEGORY_LABEL[post.category ?? ""] ?? "스포츠 거래";
  const where = [post.region_sido, post.region_sigungu].filter(Boolean).join(" ");
  return pageMeta({
    title: `${post.title} - ${cat}`,
    description: toPlainExcerpt(post.body) || `${where ? `${where} ` : ""}${cat} 거래 글 「${post.title}」`,
    path: `/trade/${post.id}`,
    type: "article",
  });
}

export default async function TradeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const initialPost = await loadTrade(id);
  return <TradeDetailView initialPost={initialPost} />;
}
