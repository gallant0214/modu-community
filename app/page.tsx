export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql } from "@/app/lib/db";
import type { Category, Post, JobPost } from "@/app/lib/types";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays <= 7) return `${diffDays}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default async function Home() {
  const [categories, latestPostsRaw, popularPostsRaw, latestJobsRaw, noticePosts] = await Promise.all([
    sql`SELECT c.*, COALESCE(p.cnt, 0) AS post_count FROM categories c LEFT JOIN (SELECT category_id, COUNT(*) AS cnt FROM posts WHERE is_notice = false OR is_notice IS NULL GROUP BY category_id) p ON c.id = p.category_id ORDER BY post_count DESC, c.name ASC`,
    sql`SELECT p.*, c.name AS category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_notice = false OR p.is_notice IS NULL ORDER BY p.created_at DESC LIMIT 5`,
    sql`SELECT p.*, c.name AS category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_notice = false OR p.is_notice IS NULL ORDER BY p.views DESC, p.likes DESC LIMIT 5`,
    sql`SELECT * FROM job_posts WHERE is_closed = false ORDER BY created_at DESC LIMIT 4`,
    sql`SELECT p.*, c.name AS category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_notice = true ORDER BY p.created_at DESC LIMIT 1`,
  ]);

  const typedCategories = categories as Category[];
  const latestPosts = latestPostsRaw as Post[];
  const popularPosts = popularPostsRaw as Post[];
  const latestJobs = latestJobsRaw as JobPost[];
  const noticePost = noticePosts as Post[];

  const popularCategories = typedCategories
    .filter((c) => Number(c.post_count) > 0)
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-4 space-y-6">

        {/* 공지 */}
        {noticePost.length > 0 && (
          <Link href={`/category/${noticePost[0].category_id}/post/${noticePost[0].id}`}
            className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-950 rounded-xl text-sm border border-blue-100 dark:border-blue-900">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">공지</span>
            <span className="text-zinc-700 dark:text-zinc-300 truncate">{noticePost[0].title}</span>
          </Link>
        )}

        {/* 인기 종목 */}
        {popularCategories.length > 0 && (
          <Section title="인기 종목" href="/category/1">
            <div className="grid grid-cols-4 gap-2">
              {popularCategories.map((c) => (
                <Link key={c.id} href={`/category/${c.id}`}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-center">
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium truncate w-full text-center">{c.name}</span>
                  <span className="text-[10px] text-zinc-400">{Number(c.post_count)}개</span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* 최신 게시글 */}
        <Section title="최신 종목후기" href="/category/1">
          {latestPosts.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-4">아직 게시글이 없습니다</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {latestPosts.map((post) => (
                <li key={post.id}>
                  <Link href={`/category/${post.category_id}/post/${post.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-1 px-1 rounded-lg transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{post.title}</p>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
                        <span className="truncate max-w-[80px]">{post.category_name}</span>
                        {post.comments_count > 0 && <><span>·</span><span>댓글 {post.comments_count}</span></>}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 shrink-0">{formatDate(post.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 인기 게시글 */}
        <Section title="인기 게시글" href="/category/1">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {popularPosts.map((post, i) => (
              <li key={post.id}>
                <Link href={`/category/${post.category_id}/post/${post.id}`}
                  className="flex items-center gap-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-1 px-1 rounded-lg transition-colors">
                  <span className={`text-sm font-bold w-5 text-center shrink-0 ${i < 3 ? "text-blue-500" : "text-zinc-300 dark:text-zinc-600"}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{post.title}</p>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
                      <span className="truncate max-w-[80px]">{post.category_name}</span>
                      <span>·</span><span>조회 {post.views}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {/* 최신 구인 */}
        <Section title="최신 구인" href="/jobs">
          {latestJobs.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-4">아직 구인 글이 없습니다</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {latestJobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-1 px-1 rounded-lg transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{job.title}</p>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
                        <span className="px-1 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-500 rounded text-[10px]">{job.sport}</span>
                        <span>{job.center_name}</span>
                        {job.region_name && <><span>·</span><span>{job.region_name}</span></>}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 shrink-0">{formatDate(job.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 실기/구술 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">실기 / 구술</h2>
            <Link href="/practical" className="text-xs text-zinc-400 hover:text-blue-500 transition-colors">더보기 →</Link>
          </div>
          <Link href="/practical"
            className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950 dark:to-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-900 hover:from-blue-100 dark:hover:from-blue-900 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">실기·구술 시험 준비</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">종목별 실기 평가항목 · 구술 문답 모음</p>
            </div>
            <svg className="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>

        {/* 하단 링크 */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 flex flex-col gap-0.5 pb-4">
          <Link href="/inquiry"
            className="flex items-center justify-between py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            <span>문의하기</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/admin"
            className="flex items-center justify-between py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <span>관리자 페이지</span>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <Link href={href} className="text-xs text-zinc-400 hover:text-blue-500 transition-colors">더보기 →</Link>
      </div>
      {children}
    </section>
  );
}
