"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { deleteUser } from "firebase/auth";
import { auth } from "@/app/lib/firebase-client";
import type { Post, JobPost } from "@/app/lib/types";

/* ── 유틸 ── */
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays <= 7) return `${diffDays}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

const adjectives = ["행��한","졸린","용감한","배고픈","신나는","깜찍한","수줍은","엉뚱한","느긋한","씩씩한","귀여���","당당한","활발한","조용한","멋진","반짝이는","소심한","든든한","장난친","심심한"];
const nouns = ["수달","판다","고양이","강아지","토끼","펭귄","다람쥐","해달","코알라","여우","오리","곰돌이","부엉이","햄스터","거북이","미어캣","알파카","치타","수박","감자"];

function generateRandomNickname() {
  for (let i = 0; i < 20; i++) {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const nick = adj + noun;
    if (nick.length >= 2 && nick.length <= 8) return nick;
  }
  return nouns[Math.floor(Math.random() * nouns.length)] + Math.floor(Math.random() * 99 + 1);
}

/* ── 타입 ── */
type Tab = "posts" | "comments" | "jobs" | "bookmarks" | "jobBookmarks";
interface MyComment {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
  post_title?: string;
  category_id?: number;
}

/* ── 공통 모달 ── */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E0D0] dark:border-zinc-700">
          <h3 className="font-semibold text-[#333] dark:text-zinc-100">{title}</h3>
          <button onClick={onClose} className="text-[#999] hover:text-[#666]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ── 카드 래퍼 ── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8E0D0] dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-[#666] dark:text-zinc-400">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/* ── 카드 행 ── */
function CardRow({ label, count, onClick, icon }: { label: string; count?: number; onClick?: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0 text-left"
    >
      <span className="text-[#6B7B3A]">{icon}</span>
      <span className="flex-1 text-sm text-[#333] dark:text-zinc-200">{label}</span>
      {count !== undefined && (
        <span className="text-xs font-medium text-[#6B7B3A] bg-[#6B7B3A]/10 px-2 py-0.5 rounded-full">{count}</span>
      )}
      <svg className="w-4 h-4 text-[#CCC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/* ── 설정 행 ── */
function SettingRow({ label, onClick, icon, danger }: { label: string; onClick?: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0 text-left"
    >
      <span className={danger ? "text-red-400" : "text-[#999]"}>{icon}</span>
      <span className={`flex-1 text-sm ${danger ? "text-red-500" : "text-[#333] dark:text-zinc-200"}`}>{label}</span>
      <svg className="w-4 h-4 text-[#CCC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/* ══════════════════════════════════════════════
   메��� My 페이지
   ══════════════════════════════════════════════ */
export default function MyPage() {
  const { user, loading, nickname, signInWithGoogle, signOutUser, getIdToken, refreshNickname } = useAuth();

  /* 탭 & 데이터 */
  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [bookmarkPosts, setBookmarkPosts] = useState<Post[]>([]);
  const [bookmarkJobs, setBookmarkJobs] = useState<JobPost[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  /* 카운트 */
  const [counts, setCounts] = useState({ posts: 0, comments: 0, jobs: 0, bookmarks: 0, jobBookmarks: 0 });

  /* 모달 상태 */
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /* 닉네임 */
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [nicknameLoading, setNicknameLoading] = useState(false);
  const [canChange, setCanChange] = useState(true);
  const [remainingDays, setRemainingDays] = useState(0);

  /* 테마 */
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  /* 초기화 */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme_preference");
      if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
    }
  }, []);

  /* 카운트 로드 */
  useEffect(() => {
    if (!user) return;
    const loadCounts = async () => {
      const token = await getIdToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [pRes, cRes, jRes, bpRes, bjRes] = await Promise.all([
          fetch(`/api/posts/my?uid=${user.uid}`, { headers }),
          fetch(`/api/comments/my?uid=${user.uid}`, { headers }),
          fetch(`/api/jobs/my?uid=${user.uid}`, { headers }),
          fetch(`/api/bookmarks?type=posts`, { headers }),
          fetch(`/api/bookmarks?type=jobs`, { headers }),
        ]);
        const [pData, cData, jData, bpData, bjData] = await Promise.all([
          pRes.json(), cRes.json(), jRes.json(), bpRes.json(), bjRes.json(),
        ]);
        setCounts({
          posts: (pData.posts || []).length,
          comments: (cData.comments || []).length,
          jobs: (jData.posts || []).length,
          bookmarks: (bpData.bookmarks || []).length,
          jobBookmarks: (bjData.bookmarks || []).length,
        });
      } catch {}
    };
    loadCounts();
  }, [user, getIdToken]);

  /* 닉네임 없으면 자동 모달 (서버에서 확인 후) */
  const [nicknameChecked, setNicknameChecked] = useState(false);
  useEffect(() => {
    if (!user || loading || nicknameChecked) return;
    // 서버에서 닉네임 존재 여부를 직접 확인
    const checkNickname = async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(`/api/nicknames?uid=${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!data.nickname) {
          // 서버에도 닉네임이 없을 때만 모달 표시
          setShowNicknameModal(true);
          setNicknameInput(generateRandomNickname());
        }
      } catch {}
      setNicknameChecked(true);
    };
    checkNickname();
  }, [user, loading, nicknameChecked, getIdToken]);

  /* 탭 데이터 로드 */
  const loadTabData = useCallback(async (tab: Tab) => {
    if (!user) return;
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
        setComments(data.comments || data.posts || []);
      } else if (tab === "jobs") {
        const res = await fetch(`/api/jobs/my?uid=${user.uid}`, { headers });
        const data = await res.json();
        setJobs(data.posts || []);
      } else if (tab === "bookmarks") {
        const res = await fetch(`/api/bookmarks?type=posts`, { headers });
        const data = await res.json();
        setBookmarkPosts(data.bookmarks || []);
      } else if (tab === "jobBookmarks") {
        const res = await fetch(`/api/bookmarks?type=jobs`, { headers });
        const data = await res.json();
        setBookmarkJobs(data.bookmarks || []);
      }
    } catch {}
    setDataLoading(false);
  }, [user, getIdToken]);

  useEffect(() => {
    if (activeTab) loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  /* 닉네임 저장 */
  const handleSaveNickname = async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed) { setNicknameError("닉네임을 입력해주세요."); return; }
    if (trimmed.length < 2 || trimmed.length > 8) { setNicknameError("닉네임은 2~8글자여야 합니다."); return; }
    setNicknameLoading(true);
    setNicknameError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/nicknames", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ nickname: trimmed, uid: user?.uid, firstSetup: showNicknameModal && !nickname }),
      });
      const data = await res.json();
      if (!res.ok) { setNicknameError(data.error || "저장에 실패했습니다."); return; }
      await refreshNickname();
      setShowNicknameModal(false);
    } catch {
      setNicknameError("오류가 발생했습니다.");
    } finally {
      setNicknameLoading(false);
    }
  };

  /* 닉네임 모달 열기 (변경 가능 여부 체크) */
  const openNicknameModal = async () => {
    setNicknameError("");
    setCanChange(true);
    if (nickname) {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/nicknames?uid=${user?.uid}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.canChange === false) {
          setCanChange(false);
          setRemainingDays(data.remainingDays || 0);
        }
      } catch {}
    }
    setNicknameInput(nickname || generateRandomNickname());
    setShowNicknameModal(true);
  };

  /* 테마 적용 */
  const applyTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    localStorage.setItem("theme_preference", t);
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else if (t === "light") {
      root.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  };

  /* 구인 완료/재게시 */
  const toggleJobClosed = async (jobId: number, isClosed: boolean) => {
    const token = await getIdToken();
    if (!token) return;
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_closed: !isClosed }),
      });
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, is_closed: !isClosed } : j));
    } catch {}
  };

  /* 탈퇴 */
  const handleDeleteAccount = async () => {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await deleteUser(currentUser);
      }
      setShowDeleteConfirm(false);
    } catch (e: any) {
      if (e?.code === "auth/requires-recent-login") {
        alert("보안을 위해 다시 로그인한 후 탈퇴해 주세요.");
      }
    }
  };

  /* ── 로딩 ── */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-6 h-6 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ── 비로그인 ── */
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-[#CCC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#333] dark:text-zinc-100 mb-2">로그인이 필요합니다</h2>
          <p className="text-sm text-[#999] mb-6">로그인하면 더 많은 기능을 이용할 수 있어요</p>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-white dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-600 rounded-xl text-sm font-medium text-[#333] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 transition-colors"
          >
            <GoogleIcon />
            Google 계정으로 로그인
          </button>
        </div>
      </div>
    );
  }

  /* ── 탭 상세 뷰 ── */
  if (activeTab) {
    const tabLabels: Record<Tab, string> = {
      posts: "내가 쓴 글", comments: "내가 쓴 댓글", jobs: "내가 등록한 구인글",
      bookmarks: "후기 북마크", jobBookmarks: "구인 북���크",
    };

    return (
      <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="mx-auto max-w-2xl">
          {/* 헤더 */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#FEFCF7] dark:bg-zinc-900 border-b border-[#E8E0D0] dark:border-zinc-700">
            <button onClick={() => setActiveTab(null)} className="p-1 text-[#999] hover:text-[#666]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-base font-semibold text-[#333] dark:text-zinc-100">{tabLabels[activeTab]}</h1>
          </div>

          {dataLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-5 h-5 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div>
              {activeTab === "posts" && (posts.length === 0 ? <EmptyState text="작성한 글이 없습니다" /> :
                <ul>{posts.map((p) => (
                  <li key={p.id} className="border-b border-[#E8E0D0]/50 dark:border-zinc-800">
                    <Link href={`/category/${p.category_id}/post/${p.id}`} className="block px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900">
                      <p className="text-sm font-medium text-[#333] dark:text-zinc-100 mb-1">{p.title}</p>
                      <div className="flex items-center gap-2 text-xs text-[#999]">
                        <span>{p.category_name || "게시판"}</span><span>·</span><span>댓글 {p.comments_count}</span><span>·</span><span>{formatDate(p.created_at)}</span>
                      </div>
                    </Link>
                  </li>
                ))}</ul>
              )}

              {activeTab === "comments" && (comments.length === 0 ? <EmptyState text="작성한 댓글이 없습니다" /> :
                <ul>{comments.map((c) => (
                  <li key={c.id} className="border-b border-[#E8E0D0]/50 dark:border-zinc-800">
                    <Link href={`/category/${c.category_id || 1}/post/${c.post_id}`} className="block px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900">
                      {c.post_title && <p className="text-xs text-[#999] mb-1 truncate">{c.post_title}</p>}
                      <p className="text-sm text-[#333] dark:text-zinc-200">{c.content}</p>
                      <p className="text-xs text-[#999] mt-1">{formatDate(c.created_at)}</p>
                    </Link>
                  </li>
                ))}</ul>
              )}

              {activeTab === "jobs" && (jobs.length === 0 ? (
                <EmptyState text="등록한 구인글이 없습니다">
                  <Link href="/jobs/write" className="mt-3 inline-block text-sm text-[#6B7B3A] hover:underline">구인 글쓰기 →</Link>
                </EmptyState>
              ) : (
                <ul>{jobs.map((job) => (
                  <li key={job.id} className="border-b border-[#E8E0D0]/50 dark:border-zinc-800">
                    <div className="px-4 py-3.5">
                      <Link href={`/jobs/${job.id}`} className="block hover:opacity-80">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-1.5 py-0.5 bg-[#6B7B3A]/10 text-[#6B7B3A] text-xs rounded font-medium">{job.sport}</span>
                          {job.is_closed && <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-[#999] text-xs rounded">모집종료</span>}
                        </div>
                        <p className="text-sm font-medium text-[#333] dark:text-zinc-100">{job.title}</p>
                        <p className="text-xs text-[#999] mt-0.5">{job.region_name} · {formatDate(job.created_at)}</p>
                      </Link>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => toggleJobClosed(job.id, job.is_closed)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            job.is_closed
                              ? "border-[#6B7B3A] text-[#6B7B3A] hover:bg-[#6B7B3A]/10"
                              : "border-[#E8E0D0] dark:border-zinc-600 text-[#666] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                          }`}
                        >{job.is_closed ? "재게시" : "구인완료"}</button>
                      </div>
                    </div>
                  </li>
                ))}</ul>
              ))}

              {activeTab === "bookmarks" && (bookmarkPosts.length === 0 ? <EmptyState text="북마크한 글이 없습니다" /> :
                <ul>{bookmarkPosts.map((p) => (
                  <li key={p.id} className="border-b border-[#E8E0D0]/50 dark:border-zinc-800">
                    <Link href={`/category/${p.category_id}/post/${p.id}`} className="block px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900">
                      <p className="text-sm font-medium text-[#333] dark:text-zinc-100 mb-1">{p.title}</p>
                      <div className="flex items-center gap-2 text-xs text-[#999]">
                        <span>{p.category_name || "게시판"}</span><span>·</span><span>{p.author}</span><span>·</span><span>{formatDate(p.created_at)}</span>
                      </div>
                    </Link>
                  </li>
                ))}</ul>
              )}

              {activeTab === "jobBookmarks" && (bookmarkJobs.length === 0 ? <EmptyState text="북마크한 구인글이 없습니다" /> :
                <ul>{bookmarkJobs.map((job) => (
                  <li key={job.id} className="border-b border-[#E8E0D0]/50 dark:border-zinc-800">
                    <Link href={`/jobs/${job.id}`} className="block px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 bg-[#6B7B3A]/10 text-[#6B7B3A] text-xs rounded font-medium">{job.sport}</span>
                        {job.is_closed && <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-[#999] text-xs rounded">모집종료</span>}
                      </div>
                      <p className="text-sm font-medium text-[#333] dark:text-zinc-100">{job.title}</p>
                      <p className="text-xs text-[#999] mt-0.5">{job.region_name} · {job.center_name}</p>
                    </Link>
                  </li>
                ))}</ul>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════
     메인 대시보드 뷰
     ══════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">

        {/* ── 1. 프로필 카드 ── */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" className="w-14 h-14 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#6B7B3A]/10 flex items-center justify-center">
                <span className="text-[#6B7B3A] font-bold text-xl">
                  {(nickname || user.displayName || "U")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-[#333] dark:text-zinc-100 text-lg">{nickname || user.displayName || "사용자"}</p>
                <button onClick={openNicknameModal} className="text-[#999] hover:text-[#666]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-[#999] truncate">{user.email}</p>
            </div>
          </div>
          {/* 카운트 요약 */}
          <div className="flex justify-around mt-4 pt-4 border-t border-[#E8E0D0] dark:border-zinc-700">
            <div className="text-center">
              <p className="text-lg font-bold text-[#6B7B3A]">{counts.posts}</p>
              <p className="text-[11px] text-[#999]">작성글</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#6B7B3A]">{counts.comments}</p>
              <p className="text-[11px] text-[#999]">댓글</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#6B7B3A]">{counts.bookmarks + counts.jobBookmarks}</p>
              <p className="text-[11px] text-[#999]">북마크</p>
            </div>
          </div>
        </div>

        {/* ── 2. 내 활동 카드 ── */}
        <Card title="내 활동">
          <CardRow label="내가 쓴 글" count={counts.posts} onClick={() => setActiveTab("posts")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
          <CardRow label="내가 쓴 댓글" count={counts.comments} onClick={() => setActiveTab("comments")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>} />
          <CardRow label="후기 북마크" count={counts.bookmarks} onClick={() => setActiveTab("bookmarks")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>} />
          <CardRow label="내가 등록한 구인글" count={counts.jobs} onClick={() => setActiveTab("jobs")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
          <CardRow label="구인 북마크" count={counts.jobBookmarks} onClick={() => setActiveTab("jobBookmarks")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>} />
        </Card>

        {/* ── 3. 설정 카드 ── */}
        <Card title="설정">
          <SettingRow label="화면 테마" onClick={() => setShowThemeModal(true)} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>} />
          <SettingRow label="로그아웃" onClick={signOutUser} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>} />
        </Card>

        {/* ── 4. 기타 카드 ── */}
        <Card title="기타">
          <SettingRow label="문의하기" onClick={() => window.location.href = "/inquiry"} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
          <SettingRow label="이용약관" onClick={() => window.open("/terms.html", "_blank")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
          <SettingRow label="탈퇴하기" onClick={() => setShowDeleteConfirm(true)} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>} danger />
        </Card>

        {/* 앱 버전 */}
        <p className="text-center text-xs text-[#CCC] py-4">앱 버전 1.0.0</p>
      </div>

      {/* ══════ 모달들 ══════ */}

      {/* 닉네임 모달 */}
      <Modal open={showNicknameModal} onClose={() => setShowNicknameModal(false)} title="닉네임 설정">
        {!canChange ? (
          <div className="text-center py-4">
            <p className="text-sm text-[#666] dark:text-zinc-400">닉네임 변경은 <strong className="text-[#6B7B3A]">{remainingDays}일 후</strong>에 가능합니다</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveNickname()}
                placeholder="2~8글자"
                maxLength={8}
                className="flex-1 px-3 py-2.5 bg-[#F5F0E5] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-600 rounded-xl text-sm text-[#333] dark:text-zinc-100 placeholder-[#CCC] focus:outline-none focus:ring-2 focus:ring-[#6B7B3A]"
              />
              <button
                onClick={() => setNicknameInput(generateRandomNickname())}
                className="px-3 py-2.5 bg-[#F5F0E5] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-600 rounded-xl text-sm hover:bg-[#E8E0D0] dark:hover:bg-zinc-700 shrink-0"
                title="랜덤 추천"
              ><svg className="w-4 h-4 text-[#999]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
            </div>
            {nicknameError && <p className="text-xs text-red-500 mb-2">{nicknameError}</p>}
            <button
              onClick={handleSaveNickname}
              disabled={nicknameLoading}
              className="w-full py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-medium rounded-xl text-sm disabled:opacity-50 transition-colors"
            >{nicknameLoading ? "저장 중..." : "저장하기"}</button>
          </>
        )}
      </Modal>

      {/* 테마 모달 */}
      <Modal open={showThemeModal} onClose={() => setShowThemeModal(false)} title="화면 테마">
        <div className="space-y-1">
          {([
            ["light", "화이트 모드", "☀️"],
            ["dark", "다크 모드", "🌙"],
            ["system", "시스템 설정", "⚙️"],
          ] as const).map(([value, label, emoji]) => (
            <button
              key={value}
              onClick={() => { applyTheme(value); setShowThemeModal(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                theme === value
                  ? "bg-[#6B7B3A]/10 text-[#6B7B3A] font-medium"
                  : "text-[#333] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              }`}
            >
              <span className="text-lg">{emoji}</span>
              <span>{label}</span>
              {theme === value && (
                <svg className="w-5 h-5 ml-auto text-[#6B7B3A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </Modal>

      {/* 탈퇴 확인 다이얼로그 */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="회원 탈퇴">
        <div className="text-center py-2">
          <p className="text-sm text-[#666] dark:text-zinc-400 mb-1">정말 탈퇴하시겠습니까?</p>
          <p className="text-xs text-[#999] mb-5">탈퇴 후에는 데이터를 복구할 수 없습니다.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 border border-[#E8E0D0] dark:border-zinc-600 rounded-xl text-sm text-[#666] dark:text-zinc-400"
            >취소</button>
            <button
              onClick={handleDeleteAccount}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium"
            >탈퇴하기</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── 공통 컴포넌트 ── */
function EmptyState({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#CCC]">
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
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
