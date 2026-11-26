import { cache } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Post } from "@/app/lib/types";
import { pageMeta, toPlainExcerpt } from "@/app/lib/seo";
import { PostView } from "./post-view";

// ISR: 60초마다 재검증. POST/PUT/DELETE 시점에 revalidatePath 로 즉시 무효화됨.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string; postId: string }>;
}

// generateMetadata 와 페이지 본문이 같은 요청에서 DB 를 두 번 읽지 않도록 묶는다.
const loadPost = cache(async (postId: string): Promise<Post | null> => {
  const id = Number(postId);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(
        "id, category_id, title, content, author, region, tags, likes, comments_count, is_notice, views, created_at, updated_at, images, categories(name)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const { categories: cat, ...rest } = data;
    return {
      ...rest,
      category_name: cat?.name ?? null,
      is_liked: false,
      is_bookmarked: false,
      is_mine: false,
      ip_display: "",
    } as unknown as Post;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps) {
  const { postId } = await params;
  const post = await loadPost(postId);
  if (!post) return { title: "게시글을 찾을 수 없습니다", robots: { index: false } };
  const categoryName = (post as { category_name?: string | null }).category_name;
  const excerpt = toPlainExcerpt(post.content);
  return pageMeta({
    title: categoryName ? `${post.title} - ${categoryName}` : post.title,
    description: excerpt || `${categoryName ?? "종목"} 게시판의 글 「${post.title}」`,
    // 주소의 종목 id 가 틀려도 같은 글이 열리므로, canonical 은 실제 소속 종목으로 고정한다.
    path: `/category/${post.category_id}/post/${post.id}`,
    type: "article",
  });
}

/**
 * 게시글 상세 Server Component.
 * 공개 필드를 서버에서 미리 조회해 HTML 에 담아 응답하고,
 * is_liked/is_bookmarked/is_mine 등 사용자별 필드는 클라이언트가 별도 fetch 로 채움.
 */
export default async function PostDetailPage({ params }: PageProps) {
  const { postId } = await params;
  const initialPost = await loadPost(postId);
  return <PostView initialPost={initialPost} />;
}
