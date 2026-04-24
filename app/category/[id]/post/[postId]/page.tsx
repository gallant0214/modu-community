import { sql } from "@/app/lib/db";
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
      const rows = await sql`
        SELECT p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags,
               p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at,
               p.images, c.name as category_name
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ${id}
      `;
      if (rows.length > 0) {
        initialPost = {
          ...rows[0],
          // 서버 컨텍스트에서는 사용자별 필드 알 수 없음. 클라이언트가 로그인 토큰으로 재조회.
          is_liked: false,
          is_bookmarked: false,
          is_mine: false,
          ip_display: "",
        } as unknown as Post;
      }
    } catch {
      // DB 장애 시 SSR 데이터 없이 렌더 → 클라이언트가 자체 fetch 로 폴백
      initialPost = null;
    }
  }

  return <PostView initialPost={initialPost} />;
}
