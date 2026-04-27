import { supabase } from "@/app/lib/supabase";
import type { Post } from "@/app/lib/types";
import { PostView } from "./post-view";

// ISR: 60초마다 재검증. POST/PUT/DELETE 시점에 revalidatePath 로 즉시 무효화됨.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string; postId: string }>;
}

/**
 * 게시글 상세 Server Component.
 * 공개 필드를 서버에서 미리 조회해 HTML 에 담아 응답하고,
 * is_liked/is_bookmarked/is_mine 등 사용자별 필드는 클라이언트가 별도 fetch 로 채움.
 */
export default async function PostDetailPage({ params }: PageProps) {
  const { postId } = await params;
  const id = Number(postId);

  let initialPost: Post | null = null;

  if (Number.isFinite(id) && id > 0) {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, category_id, title, content, author, region, tags, likes, comments_count, is_notice, views, created_at, updated_at, images, categories(name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (!error && data) {
        const { categories: cat, ...rest } = data;
        initialPost = {
          ...rest,
          category_name: cat?.name ?? null,
          is_liked: false,
          is_bookmarked: false,
          is_mine: false,
          ip_display: "",
        } as unknown as Post;
      }
    } catch {
      initialPost = null;
    }
  }

  return <PostView initialPost={initialPost} />;
}
