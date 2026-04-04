"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import type { Post, JobPost } from "@/app/lib/types";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays <= 7) return `${diffDays}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

type Tab = "posts" | "comments" | "jobs" | "bookmarkPosts" | "bookmarkJobs";

interface MyComment {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
  post_title?: string;
  category_id?: number;
}

export default function MyPage() {
  const { user, loading, nickname, signInWithGoogle, signOutUser, getIdToken, refreshNickname } = useAuth();
  const [tab, setTab] = useState<Tab>("posts");

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [bookmarkPosts, setBookmarkPosts] = useState<Post[]>([]);
  const [bookmarkJobs, setBookmarkJobs] = useState<JobPost[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [showNicknameForm, setShowNicknameForm] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [nicknameLoading, setNicknameLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setDataLoading(true);
      const token = await getIdToken();
      if (!token) { setDataLoading(false); return; }
      const headers = { Authorization: `Bearer ${token}` };
      try {
        if (tab === "posts") {
          const res = await fetch(`/api/posts/my?uid=${user.uid}`, { headers });
          const data = await res.json();
          setPosts(data.posts || []);
        } else if (tab === "comments") {
          const res = await fetch(`/api/comments/my?uid=${user.uid}`, { headers });
          const data = await res.json();
          setComments(data.comments || []);
        } else if (tab === "jobs") {
          const res = await fetch(`/api/jobs/my?uid=${user.uid}`, { headers });
          const data = await res.json();
          setJobs(data.posts || []);
        } else if (tab === "bookmarkPosts") {
          const res = await fetch(`/api/bookmarks?type=posts`, { headers });
          const data = await res.json();
          setBookmarkPosts(data.bookmarks || []);
        } else if (tab === "bookmarkJobs") {
          const res = await fetch(`/api/bookmarks?type=jobs`, { headers });
          const data = await res.json();
          setBookmarkJobs(data.bookmarks || []);
        }
      } catch {}
      setDataLoading(false);
    };
    load();
  }, [user, tab, getIdToken]);

  const handleSaveNickname = async () => {
    if (!nicknameInput.trim()) { setNicknameError("닉네임을 입력해주세요."); return; }
    if (nicknameInput.trim().length < 2) { setNicknameError("닉네임은 2글자 이상이어야 합니다."); return; }
    setNicknameLoading(true);
    setNicknameError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/nicknames", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ nickname: nicknameInput.trim(), uid: user?.uid }),
      });
      const data = await res.json();
      if (!res.ok) { setNicknameError(data.error || "저장에 실패했습니다."); return; }
      await refreshNickname();
      setShowNicknameForm(false);
    } catch {
      setNicknameError("오류가 발생했습니다.");
    } finally {
      setNicknameLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">로그인이 필요합니다</h2>
          <p className="text-sm text-zinc-500">Google 계정으로 간편하게 로그인하세요</p>
        </div>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-2.5 px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium text-sm shadow-sm"
        >
          <GoogleIcon />
          Google로 로그인
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">

        {/* 프로필 섹션 */}
        <div className="px-4 py-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="프로필" className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">
                  {(nickname || user.displayName || "U")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {nickname || user.displayName || "사용자"}
              </p>
              <p className="text-xs text-zinc-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={() => { setShowNicknameForm(!showNicknameForm); setNicknameInput(nickname || ""); setNicknameError(""); }}
              className="text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >닉네임 변경</button>
          </div>

          {showNicknameForm && (
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveNickname()}
                  placeholder="새 닉네임 입력"
                  maxLength={20}
                  className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveNickname}
                  disabled={nicknameLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50"
                >{nicknameLoading ? "저장 중" : "저장"}</button>
              </div>
              {nicknameError && <p className="text-xs text-red-500 mt-1">{nicknameError}</p>}
            </div>
          )}

          <div className="flex items-center justify-end mt-3">
            <button
              onClick={signOutUser}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >로그아웃</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto">
          {(["posts", "comments", "jobs", "bookmarkPosts", "bookmarkJobs"] as Tab[]).map((t) => {
            const labels: Record<Tab, string> = {
              posts: "내 게시글", comments: "내 댓글", jobs: "내 구인글",
              bookmarkPosts: "후기 북마크", bookmarkJobs: "구인 북마크"
            };
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`shrink-0 px-3 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t ? "text-blue-600 border-b-2 border-blue-600" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >{labels[t]}</button>
            );
          })}
        </div>

        {/* 콘텐츠 */}
        {dataLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            {tab === "posts" && (
              posts.length === 0 ? (
                <EmptyState text="작성한 게시글이 없습니다" />
              ) : (
                <ul>
                  {posts.map((post) => (
                    <li key={post.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <Link href={`/category/${post.category_id}/post/${post.id}`}
                        className="block px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 leading-snug">{post.title}</p>
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <span>{post.category_name || "게시판"}</span>
                          <span>·</span><span>댓글 {post.comments_count}</span>
                          <span>·</span><span>{formatDate(post.created_at)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === "comments" && (
              comments.length === 0 ? (
                <EmptyState text="작성한 댓글이 없습니다" />
              ) : (
                <ul>
                  {comments.map((c) => (
                    <li key={c.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <Link href={`/category/${c.category_id || 1}/post/${c.post_id}`}
                        className="block px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        {c.post_title && (
                          <p className="text-xs text-zinc-400 mb-1 truncate">{c.post_title}</p>
                        )}
                        <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-snug">{c.content}</p>
                        <p className="text-xs text-zinc-400 mt-1">{formatDate(c.created_at)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === "jobs" && (
              jobs.length === 0 ? (
                <EmptyState text="작성한 구인글이 없습니다">
                  <Link href="/jobs/write"
                    className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                    구인 글쓰기 →
                  </Link>
                </EmptyState>
              ) : (
                <ul>
                  {jobs.map((job) => (
                    <li key={job.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <Link href={`/jobs/${job.id}`}
                        className="block px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="inline-block px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 text-xs rounded">{job.sport}</span>
                              {job.is_closed && <span className="inline-block px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-xs rounded">모집종료</span>}
                            </div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug">{job.title}</p>
                            <p className="text-xs text-zinc-400 mt-0.5">{job.region_name} · {formatDate(job.created_at)}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === "bookmarkPosts" && (
              bookmarkPosts.length === 0 ? (
                <EmptyState text="북마크한 게시글이 없습니다" />
              ) : (
                <ul>
                  {bookmarkPosts.map((post) => (
                    <li key={post.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <Link href={`/category/${post.category_id}/post/${post.id}`}
                        className="block px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 leading-snug">{post.title}</p>
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <span>{post.category_name || "게시판"}</span>
                          <span>·</span><span>{post.author}</span>
                          <span>·</span><span>{formatDate(post.created_at)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === "bookmarkJobs" && (
              bookmarkJobs.length === 0 ? (
                <EmptyState text="북마크한 구인글이 없습니다" />
              ) : (
                <ul>
                  {bookmarkJobs.map((job) => (
                    <li key={job.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <Link href={`/jobs/${job.id}`}
                        className="block px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-block px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 text-xs rounded">{job.sport}</span>
                          {job.is_closed && <span className="inline-block px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-xs rounded">모집종료</span>}
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug">{job.title}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{job.region_name} · {job.center_name}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
      <svg className="w-10 h-10 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">{text}</p>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
