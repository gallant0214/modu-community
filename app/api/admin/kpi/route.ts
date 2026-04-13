import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  try {
    // 모든 KPI 쿼리를 병렬 실행
    const [
      userCount,
      usersThisMonth,
      usersThisWeek,
      usersToday,
      totalPosts,
      postsThisMonth,
      postsThisWeek,
      totalComments,
      commentsThisMonth,
      totalJobs,
      openJobs,
      closedJobs,
      jobsThisMonth,
      totalInquiries,
      pendingInquiries,
      totalReports,
      pendingReports,
      totalPostBookmarks,
      totalJobBookmarks,
      totalPostLikes,
      totalCommentLikes,
      activePostersWeek,
      activeCommentersWeek,
      topCategories,
      topPosts,
    ] = await Promise.all([
      // ── 사용자 ──
      sql`SELECT COUNT(*) as count FROM user_first_seen`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM user_first_seen WHERE seen_at >= date_trunc('month', CURRENT_DATE)`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM user_first_seen WHERE seen_at >= CURRENT_DATE - INTERVAL '7 days'`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM user_first_seen WHERE seen_at >= CURRENT_DATE`.catch(() => [{ count: 0 }]),
      // ── 게시글 ──
      sql`SELECT COUNT(*) as count FROM posts WHERE is_notice = false OR is_notice IS NULL`,
      sql`SELECT COUNT(*) as count FROM posts WHERE (is_notice = false OR is_notice IS NULL) AND created_at >= date_trunc('month', CURRENT_DATE)`,
      sql`SELECT COUNT(*) as count FROM posts WHERE (is_notice = false OR is_notice IS NULL) AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
      // ── 댓글 ──
      sql`SELECT COUNT(*) as count FROM comments`,
      sql`SELECT COUNT(*) as count FROM comments WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      // ── 구인 ──
      sql`SELECT COUNT(*) as count FROM job_posts`,
      sql`SELECT COUNT(*) as count FROM job_posts WHERE is_closed = false OR is_closed IS NULL`,
      sql`SELECT COUNT(*) as count FROM job_posts WHERE is_closed = true`,
      sql`SELECT COUNT(*) as count FROM job_posts WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      // ── 문의 ──
      sql`SELECT COUNT(*) as count FROM inquiries`,
      sql`SELECT COUNT(*) as count FROM inquiries WHERE (hidden = false OR hidden IS NULL) AND reply IS NULL`,
      // ── 신고 ──
      sql`SELECT COUNT(*) as count FROM reports`,
      sql`SELECT COUNT(*) as count FROM reports WHERE resolved = false OR resolved IS NULL`,
      // ── 북마크 ──
      sql`SELECT COUNT(*) as count FROM post_bookmarks`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM job_post_bookmarks`.catch(() => [{ count: 0 }]),
      // ── 좋아요 ──
      sql`SELECT COUNT(*) as count FROM post_likes`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(*) as count FROM comment_likes`.catch(() => [{ count: 0 }]),
      // ── 활성 사용자 (7일) ──
      sql`SELECT COUNT(DISTINCT firebase_uid) as count FROM posts WHERE firebase_uid IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '7 days'`.catch(() => [{ count: 0 }]),
      sql`SELECT COUNT(DISTINCT firebase_uid) as count FROM comments WHERE firebase_uid IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '7 days'`.catch(() => [{ count: 0 }]),
      // ── 인기 카테고리 (이번 달) ──
      sql`SELECT c.name, COUNT(p.id) as post_count FROM posts p JOIN categories c ON p.category_id = c.id WHERE p.created_at >= date_trunc('month', CURRENT_DATE) AND (p.is_notice = false OR p.is_notice IS NULL) GROUP BY c.name ORDER BY post_count DESC LIMIT 5`.catch(() => []),
      // ── 인기 게시글 (이번 달, 조회수) ──
      sql`SELECT id, title, views, likes, comments_count FROM posts WHERE created_at >= date_trunc('month', CURRENT_DATE) AND (is_notice = false OR is_notice IS NULL) ORDER BY views DESC LIMIT 5`.catch(() => []),
    ]);

    return NextResponse.json({
      users: {
        total: Number(userCount[0]?.count || 0),
        thisMonth: Number(usersThisMonth[0]?.count || 0),
        thisWeek: Number(usersThisWeek[0]?.count || 0),
        today: Number(usersToday[0]?.count || 0),
      },
      posts: {
        total: Number(totalPosts[0]?.count || 0),
        thisMonth: Number(postsThisMonth[0]?.count || 0),
        thisWeek: Number(postsThisWeek[0]?.count || 0),
      },
      comments: {
        total: Number(totalComments[0]?.count || 0),
        thisMonth: Number(commentsThisMonth[0]?.count || 0),
      },
      jobs: {
        total: Number(totalJobs[0]?.count || 0),
        open: Number(openJobs[0]?.count || 0),
        closed: Number(closedJobs[0]?.count || 0),
        thisMonth: Number(jobsThisMonth[0]?.count || 0),
      },
      inquiries: {
        total: Number(totalInquiries[0]?.count || 0),
        pending: Number(pendingInquiries[0]?.count || 0),
      },
      reports: {
        total: Number(totalReports[0]?.count || 0),
        pending: Number(pendingReports[0]?.count || 0),
      },
      engagement: {
        postBookmarks: Number(totalPostBookmarks[0]?.count || 0),
        jobBookmarks: Number(totalJobBookmarks[0]?.count || 0),
        postLikes: Number(totalPostLikes[0]?.count || 0),
        commentLikes: Number(totalCommentLikes[0]?.count || 0),
        activePostersWeek: Number(activePostersWeek[0]?.count || 0),
        activeCommentersWeek: Number(activeCommentersWeek[0]?.count || 0),
      },
      topCategories: topCategories.map((r: any) => ({ name: r.name, count: Number(r.post_count) })),
      topPosts: topPosts.map((r: any) => ({ id: r.id, title: r.title, views: Number(r.views), likes: Number(r.likes), comments: Number(r.comments_count) })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
