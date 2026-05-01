"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { deleteUser } from "firebase/auth";
import { auth } from "@/app/lib/firebase-client";
import type { Post, JobPost, Message } from "@/app/lib/types";
import { SendMessageModal } from "@/app/components/send-message-modal";

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

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. ${h}:${min}`;
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
type Tab = "posts" | "comments" | "jobs" | "bookmarks" | "jobBookmarks" | "notifications" | "receivedMessages" | "sentMessages" | "blocks";

interface BlockedUser {
  blocked_uid: string;
  blocked_nickname: string;
  created_at: string;
}
interface MyComment {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
  post_title?: string;
  category_id?: number;
}
interface MyNotification {
  id: number;
  title: string;
  body: string;
  broadcast_type: string;
  created_at: string;
  is_read: boolean;
  type?: string;
  data?: string | null;
}

/* ── 공통 모달 ── */
function Modal({ open, onClose, title, children, dismissible = true }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; dismissible?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={dismissible ? onClose : undefined} />
      <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E0D0] dark:border-zinc-700">
          <h3 className="font-semibold text-[#333] dark:text-zinc-100">{title}</h3>
          {dismissible && (
            <button onClick={onClose} className="text-[#999] hover:text-[#666]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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
function CardRow({ label, count, badge, nBadge, onClick, icon }: { label: string; count?: number; badge?: number; nBadge?: boolean; onClick?: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0 text-left"
    >
      <span className="text-[#6B7B3A]">{icon}</span>
      <span className="flex-1 text-sm text-[#333] dark:text-zinc-200">{label}</span>
      {nBadge && (
        <span className="text-[10px] font-bold text-white bg-[#C0392B] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none">N</span>
      )}
      {badge !== undefined && badge > 0 && (
        <span className="text-[11px] font-bold text-white bg-[#C0392B] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">{badge}</span>
      )}
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
   메인 My 페이지 (Suspense 래퍼)
   ══════════════════════════════════════════════ */
export default function MyPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-6 h-6 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MyPageContent />
    </Suspense>
  );
}

function MyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, nickname, signInWithGoogle, signInWithApple, signOutUser, getIdToken, refreshNickname } = useAuth();

  /* 탭 & 데이터 */
  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [bookmarkPosts, setBookmarkPosts] = useState<Post[]>([]);
  const [bookmarkJobs, setBookmarkJobs] = useState<JobPost[]>([]);
  const [notifications, setNotifications] = useState<MyNotification[]>([]);
  const [receivedMessages, setReceivedMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [unblockingNickname, setUnblockingNickname] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  /* 쪽지 상세 */
  const [messageThread, setMessageThread] = useState<{ original: Message; replies: Message[] } | null>(null);
  const [showReplyModal, setShowReplyModal] = useState(false);
  // parentId 있으면 답장 (받은쪽지), 없으면 다시보내기 (보낸쪽지 → 새 thread).
  const [replyTo, setReplyTo] = useState<{ nickname: string; parentId?: number } | null>(null);

  /* 쪽지 삭제 확인 */
  const [deleteMessageDialog, setDeleteMessageDialog] = useState<{ id: number; type: "received" | "sent" } | null>(null);
  const [deleteAllMessagesDialog, setDeleteAllMessagesDialog] = useState<"received" | "sent" | null>(null);

  /* 알림 삭제 확인 */
  const [deleteNotificationDialog, setDeleteNotificationDialog] = useState<number | null>(null);
  const [deleteAllNotificationsDialog, setDeleteAllNotificationsDialog] = useState<boolean>(false);

  /* 카운트 */
  const [counts, setCounts] = useState({ posts: 0, comments: 0, jobs: 0, bookmarks: 0, jobBookmarks: 0, notifications: 0, receivedMessages: 0, sentMessages: 0, blocks: 0 });
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  /* 모달 상태 */
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /* 닉네임 */
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [nicknameLoading, setNicknameLoading] = useState(false);
  const [canChange, setCanChange] = useState(true);
  const [remainingDays, setRemainingDays] = useState(0);


  /* 카운트 로드 — 캐시된 값 즉시 표시 + 백그라운드 갱신 */
  useEffect(() => {
    if (!user) return;
    // 1단계: localStorage 캐시된 값 즉시 표시 (재방문 시 빈 0 대신 숫자)
    try {
      const cacheKey = `my_counts_${user.uid}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.counts) setCounts(parsed.counts);
        if (typeof parsed?.unread === "number") setUnreadNotifications(parsed.unread);
      }
    } catch {}

    // 2단계: 서버 최신 데이터 백그라운드 갱신
    const loadCounts = async () => {
      const token = await getIdToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [pRes, cRes, jRes, bpRes, bjRes, nRes, rmRes, smRes, blkRes] = await Promise.all([
          fetch(`/api/posts/my?uid=${user.uid}`, { headers }),
          fetch(`/api/comments/my?uid=${user.uid}`, { headers }),
          fetch(`/api/jobs/my?uid=${user.uid}`, { headers }),
          fetch(`/api/bookmarks?type=posts`, { headers }),
          fetch(`/api/bookmarks?type=jobs`, { headers }),
          fetch(`/api/notifications/web`, { headers }),
          fetch(`/api/messages?type=received`, { headers }),
          fetch(`/api/messages?type=sent`, { headers }),
          fetch(`/api/users/blocks`, { headers }),
        ]);
        const [pData, cData, jData, bpData, bjData, nData, rmData, smData, blkData] = await Promise.all([
          pRes.json(), cRes.json(), jRes.json(), bpRes.json(), bjRes.json(), nRes.json(), rmRes.json(), smRes.json(), blkRes.json(),
        ]);
        const nextCounts = {
          posts: (pData.posts || []).length,
          comments: (cData.comments || []).length,
          jobs: (jData.posts || []).length,
          bookmarks: (bpData.bookmarks || []).length,
          jobBookmarks: (bjData.bookmarks || []).length,
          notifications: (nData.notifications || []).length,
          receivedMessages: (rmData.messages || []).length,
          sentMessages: (smData.messages || []).length,
          blocks: (blkData.blocks || []).length,
        };
        const unread = (nData.notifications || []).filter((n: { is_read: boolean }) => !n.is_read).length;
        setUnreadMessages(rmData.unreadCount || 0);
        setCounts(nextCounts);
        setUnreadNotifications(unread);
        // localStorage 캐시 업데이트
        try {
          localStorage.setItem(`my_counts_${user.uid}`, JSON.stringify({ counts: nextCounts, unread, ts: Date.now() }));
        } catch {}
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

  /* 탭 데이터 로드 — 캐시 즉시 표시 + 백그라운드 갱신 */
  const loadTabData = useCallback(async (tab: Tab) => {
    if (!user) return;
    // 1단계: localStorage 캐시 즉시 표시 (탭 전환 체감 속도 향상)
    const cacheKey = `my_tab_${tab}_${user.uid}`;
    let hadCache = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.data) {
          if (tab === "posts") setPosts(parsed.data);
          else if (tab === "comments") setComments(parsed.data);
          else if (tab === "jobs") setJobs(parsed.data);
          else if (tab === "bookmarks") setBookmarkPosts(parsed.data);
          else if (tab === "jobBookmarks") setBookmarkJobs(parsed.data);
          else if (tab === "notifications") setNotifications(parsed.data);
          else if (tab === "receivedMessages") setReceivedMessages(parsed.data);
          else if (tab === "sentMessages") setSentMessages(parsed.data);
          else if (tab === "blocks") setBlockedUsers(parsed.data);
          hadCache = true;
        }
      }
    } catch {}

    // 캐시 있으면 로딩 스피너 생략 (백그라운드 갱신)
    if (!hadCache) setDataLoading(true);
    const token = await getIdToken();
    if (!token) { setDataLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    const saveCache = (data: unknown) => {
      try { localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch {}
    };

    try {
      if (tab === "posts") {
        const res = await fetch(`/api/posts/my?uid=${user.uid}`, { headers });
        const data = await res.json();
        const list = data.posts || [];
        setPosts(list);
        saveCache(list);
      } else if (tab === "comments") {
        const res = await fetch(`/api/comments/my?uid=${user.uid}`, { headers });
        const data = await res.json();
        const list = data.comments || data.posts || [];
        setComments(list);
        saveCache(list);
      } else if (tab === "jobs") {
        const res = await fetch(`/api/jobs/my?uid=${user.uid}`, { headers });
        const data = await res.json();
        const list = data.posts || [];
        setJobs(list);
        saveCache(list);
      } else if (tab === "bookmarks") {
        const res = await fetch(`/api/bookmarks?type=posts`, { headers });
        const data = await res.json();
        const list = data.bookmarks || [];
        setBookmarkPosts(list);
        saveCache(list);
      } else if (tab === "jobBookmarks") {
        const res = await fetch(`/api/bookmarks?type=jobs`, { headers });
        const data = await res.json();
        const list = data.bookmarks || [];
        setBookmarkJobs(list);
        saveCache(list);
      } else if (tab === "notifications") {
        const res = await fetch(`/api/notifications/web`, { headers });
        const data = await res.json();
        const list = data.notifications || [];
        setNotifications(list);
        saveCache(list);
        // 알림 탭 진입 시 모두 읽음 처리 + 빨간 뱃지 제거
        setUnreadNotifications(0);
        fetch(`/api/notifications/web`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ readAll: true }),
        }).catch(() => {});
      } else if (tab === "receivedMessages") {
        const res = await fetch(`/api/messages?type=received`, { headers });
        const data = await res.json();
        const list = data.messages || [];
        setReceivedMessages(list);
        saveCache(list);
        setUnreadMessages(data.unreadCount || 0);
      } else if (tab === "sentMessages") {
        const res = await fetch(`/api/messages?type=sent`, { headers });
        const data = await res.json();
        const list = data.messages || [];
        setSentMessages(list);
        saveCache(list);
      } else if (tab === "blocks") {
        const res = await fetch(`/api/users/blocks`, { headers });
        const data = await res.json();
        const list = data.blocks || [];
        setBlockedUsers(list);
        saveCache(list);
      }
    } catch {}
    setDataLoading(false);
  }, [user, getIdToken]);

  useEffect(() => {
    if (activeTab) loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  /* 차단 해제 */
  const handleUnblock = async (nickname: string) => {
    if (unblockingNickname) return;
    setUnblockingNickname(nickname);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/users/block`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) throw new Error("해제 실패");
      setBlockedUsers((prev) => prev.filter((b) => b.blocked_nickname !== nickname));
      setCounts((c) => ({ ...c, blocks: Math.max(0, c.blocks - 1) }));
      // localStorage 캐시도 동기화 — 다음 진입 시 stale 한 차단 목록이 잠깐 보이지 않도록
      if (user) {
        try {
          const cacheKey = `my_tab_blocks_${user.uid}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            const next = (parsed.data || []).filter((b: BlockedUser) => b.blocked_nickname !== nickname);
            localStorage.setItem(cacheKey, JSON.stringify({ data: next, ts: Date.now() }));
          }
        } catch {}
      }
    } catch {
      alert("차단을 해제하지 못했습니다.");
    } finally {
      setUnblockingNickname(null);
    }
  };

  /* 쪽지 삭제 (개별) */
  const confirmDeleteMessage = async () => {
    if (!deleteMessageDialog) return;
    const { id, type } = deleteMessageDialog;
    setDeleteMessageDialog(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/messages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("삭제 실패");
      if (type === "received") {
        setReceivedMessages((prev) => prev.filter((m) => m.id !== id));
        setCounts((c) => ({ ...c, receivedMessages: Math.max(0, c.receivedMessages - 1) }));
      } else {
        setSentMessages((prev) => prev.filter((m) => m.id !== id));
        setCounts((c) => ({ ...c, sentMessages: Math.max(0, c.sentMessages - 1) }));
      }
    } catch {
      alert("쪽지를 삭제하지 못했습니다.");
    }
  };

  /* 쪽지 모두 삭제 */
  const confirmDeleteAllMessages = async () => {
    if (!deleteAllMessagesDialog) return;
    const type = deleteAllMessagesDialog;
    setDeleteAllMessagesDialog(null);
    const list = type === "received" ? receivedMessages : sentMessages;
    if (list.length === 0) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      await Promise.all(
        list.map((m) =>
          fetch(`/api/messages/${m.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
        ),
      );
      if (type === "received") {
        setReceivedMessages([]);
        setCounts((c) => ({ ...c, receivedMessages: 0 }));
      } else {
        setSentMessages([]);
        setCounts((c) => ({ ...c, sentMessages: 0 }));
      }
    } catch {
      alert("쪽지를 삭제하지 못했습니다.");
    }
  };

  /* 알림 개별 삭제 */
  const confirmDeleteNotification = async () => {
    if (!deleteNotificationDialog) return;
    const id = deleteNotificationDialog;
    setDeleteNotificationDialog(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("삭제 실패");
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setCounts((c) => ({ ...c, notifications: Math.max(0, c.notifications - 1) }));
    } catch {
      alert("알림을 삭제하지 못했습니다.");
    }
  };

  /* 알림 모두 삭제 */
  const confirmDeleteAllNotifications = async () => {
    setDeleteAllNotificationsDialog(false);
    if (notifications.length === 0) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      await Promise.all(
        notifications.map((n) =>
          fetch(`/api/notifications/${n.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
        ),
      );
      setNotifications([]);
      setCounts((c) => ({ ...c, notifications: 0 }));
      setUnreadNotifications(0);
    } catch {
      alert("알림을 삭제하지 못했습니다.");
    }
  };

  /* URL 쿼리에서 tab/highlight 읽어 자동 전환 (없으면 메인 대시보드로 복귀) */
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const highlightParam = searchParams.get("highlight");
    const validTabs: Tab[] = ["posts", "comments", "jobs", "bookmarks", "jobBookmarks", "notifications", "receivedMessages", "sentMessages", "blocks"];
    if (tabParam && validTabs.includes(tabParam as Tab)) {
      setActiveTab(tabParam as Tab);
      if (tabParam === "notifications" && highlightParam) {
        const id = Number(highlightParam);
        if (!Number.isNaN(id)) setHighlightId(id);
      }
    } else {
      setActiveTab(null);
      setHighlightId(null);
    }
  }, [searchParams]);

  /* highlightId가 설정되면 1.8초 후 자동 해제 (애니메이션 종료) */
  useEffect(() => {
    if (highlightId == null) return;
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightId]);

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
      if (!res.ok) {
        setNicknameError(data.error || "저장에 실패했습니다.");
        // 에러 발생 시 입력창 포커스 + 텍스트 선택 → 바로 재입력 가능
        setTimeout(() => {
          const el = document.getElementById("nickname-input") as HTMLInputElement | null;
          if (el) { el.focus(); el.select(); }
        }, 50);
        return;
      }
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

  /* 구인글 삭제 */
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const handleDeleteJob = async (jobId: number) => {
    const token = await getIdToken();
    if (!token) return;
    // 낙관적 삭제
    const backup = jobs;
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setDeletingJobId(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setJobs(backup); alert("삭제에 실패했습니다"); }
    } catch { setJobs(backup); alert("오류가 발생했습니다"); }
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-zinc-50 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-950">
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-100 dark:border-zinc-800 p-8 sm:p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">로그인하고 시작하세요</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              로그인하면 글 작성, 북마크, 닉네임 설정 등<br />
              나만의 활동을 관리할 수 있어요
            </p>
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:shadow-md transition-all mb-2"
            >
              <GoogleIcon />
              Google로 로그인
            </button>
            <button
              onClick={signInWithApple}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-black text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-zinc-800 hover:shadow-md transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 384 512" fill="currentColor">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
              </svg>
              Apple로 로그인
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-4">가입 없이 바로 시작할 수 있어요</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── 탭 상세 뷰 ── */
  if (activeTab) {
    const tabLabels: Record<Tab, string> = {
      posts: "내가 쓴 글", comments: "내가 쓴 댓글", jobs: "내가 등록한 구인글",
      bookmarks: "후기 북마크", jobBookmarks: "구인 북마크", notifications: "알림 리스트",
      receivedMessages: "받은 쪽지함", sentMessages: "보낸 쪽지함", blocks: "차단된 사용자",
    };

    return (
      <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="mx-auto max-w-2xl">
          {/* 헤더 */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#FEFCF7] dark:bg-zinc-900 border-b border-[#E8E0D0] dark:border-zinc-700">
            <button onClick={() => router.push("/my")} className="p-1 text-[#999] hover:text-[#666]">
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
              {activeTab === "posts" && (posts.length === 0 ? (
                <div className="px-4 py-10">
                  <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                    <div aria-hidden className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                      <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-1">작성한 글이 없습니다</p>
                      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">게시판에<br />첫 글을 남겨보세요</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-6">
                  {/* 요약 바 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
                      <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">My Writings</span>
                    </div>
                    <span className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                      총 <span className="font-bold text-[#6B7B3A]">{posts.length}</span>개
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {posts.map((p) => (
                      <li
                        key={p.id}
                        className="group relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_22px_-20px_rgba(107,93,71,0.3)] overflow-hidden"
                      >
                        <Link
                          href={`/category/${p.category_id}/post/${p.id}?from=${encodeURIComponent("/my?tab=posts")}`}
                          className="block px-4 py-3.5 hover:bg-[#FBF7EB]/50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* 상단: 카테고리 칩 · 날짜 */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[11px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] truncate max-w-[65%]">
                              <span className="w-1 h-1 rounded-full bg-[#6B7B3A] shrink-0" />
                              <span className="truncate">{p.category_name || "게시판"}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#A89B80] dark:text-zinc-500 shrink-0">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatDate(p.created_at)}
                            </span>
                          </div>

                          {/* 제목 */}
                          <p className="text-[14.5px] font-bold tracking-tight leading-snug text-[#2A251D] dark:text-zinc-100 line-clamp-2">
                            {p.title}
                          </p>

                          {/* 하단: 통계 + 화살표 */}
                          <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-[#F0E9D8] dark:border-zinc-800">
                            <div className="flex items-center gap-3 text-[11px] text-[#A89B80] dark:text-zinc-500">
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span className={p.comments_count > 0 ? "font-semibold text-[#6B7B3A] dark:text-[#A8B87A]" : ""}>{p.comments_count}</span>
                              </span>
                              {typeof p.views === "number" && (
                                <span className="inline-flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  {p.views}
                                </span>
                              )}
                              {typeof p.likes === "number" && p.likes > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                  </svg>
                                  {p.likes}
                                </span>
                              )}
                            </div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A89B80] group-hover:text-[#6B7B3A] dark:text-zinc-500 transition-colors">
                              열기
                              <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {activeTab === "comments" && (comments.length === 0 ? (
                <div className="px-4 py-10">
                  <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                    <div aria-hidden className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-1">작성한 댓글이 없습니다</p>
                      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">공감한 글에<br />첫 댓글을 남겨보세요</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-6">
                  {/* 요약 바 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
                      <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">My Replies</span>
                    </div>
                    <span className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                      총 <span className="font-bold text-[#6B7B3A]">{comments.length}</span>개
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {comments.map((c) => (
                      <li
                        key={c.id}
                        className="group relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_22px_-20px_rgba(107,93,71,0.3)] overflow-hidden"
                      >
                        <Link
                          href={`/category/${c.category_id || 1}/post/${c.post_id}?from=${encodeURIComponent("/my?tab=comments")}&hc=${c.id}`}
                          className="flex items-stretch hover:bg-[#FBF7EB]/50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* 좌측 악센트 바 */}
                          <span aria-hidden className="w-[3px] shrink-0 bg-gradient-to-b from-[#6B7B3A]/60 via-[#6B7B3A]/25 to-transparent" />

                          <div className="flex-1 min-w-0 px-4 py-3.5">
                            {/* 원글 컨텍스트 */}
                            {c.post_title && (
                              <div className="flex items-center gap-1.5 mb-2 min-w-0">
                                <svg className="w-3 h-3 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span className="truncate text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500 uppercase tracking-wide">
                                  {c.post_title}
                                </span>
                              </div>
                            )}

                            {/* 댓글 내용 */}
                            <p className="text-[13.5px] leading-relaxed text-[#2A251D] dark:text-zinc-100 line-clamp-3 whitespace-pre-line">
                              {c.content}
                            </p>

                            {/* 하단: 날짜 + 원글 보기 */}
                            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-[#F0E9D8] dark:border-zinc-800">
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#A89B80] dark:text-zinc-500">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatDate(c.created_at)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A89B80] group-hover:text-[#6B7B3A] dark:text-zinc-500 transition-colors">
                                원글 보기
                                <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {activeTab === "jobs" && (jobs.length === 0 ? (
                <div className="px-4 py-10">
                  <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                    <div aria-hidden className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-1">등록한 구인글이 없습니다</p>
                      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mb-5 leading-relaxed">첫 공고를 올려<br />우리 센터의 인재를 모집해 보세요</p>
                      <Link
                        href="/jobs/write"
                        className="inline-flex items-center gap-1.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl shadow-[0_6px_18px_-8px_rgba(107,123,58,0.5)] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        구인 글쓰기
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-6">
                  {/* 요약 바 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
                      <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">My Recruiting</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-[#8C8270] dark:text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6B7B3A]" />
                        모집중 <span className="font-bold text-[#6B7B3A]">{jobs.filter((j) => !j.is_closed).length}</span>
                      </span>
                      <span className="text-[#E8E0D0] dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1 text-[#8C8270] dark:text-zinc-500">
                        종료 <span className="font-bold text-[#8C8270] dark:text-zinc-500">{jobs.filter((j) => j.is_closed).length}</span>
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {jobs.map((job) => {
                      const isOpen = !job.is_closed;
                      return (
                        <li
                          key={job.id}
                          className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_28px_-22px_rgba(107,93,71,0.3)] overflow-hidden"
                        >
                          {/* 상단 그라데이션 악센트 (모집중일 때만) */}
                          {isOpen && (
                            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                          )}

                          <Link
                            href={`/jobs/${job.id}?from=${encodeURIComponent("/my?tab=jobs")}`}
                            className="block px-4 pt-4 pb-3 hover:bg-[#FBF7EB]/50 dark:hover:bg-zinc-800/40 transition-colors"
                          >
                            {/* 상단 칩 줄 */}
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                                  isOpen
                                    ? "bg-[#6B7B3A]/10 text-[#6B7B3A]"
                                    : "bg-[#EFE7D5] dark:bg-zinc-800 text-[#8C8270] dark:text-zinc-500"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-[#6B7B3A] animate-pulse" : "bg-[#A89B80]"}`} />
                                {isOpen ? "모집중" : "모집종료"}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[11px] font-semibold text-[#6B5D47] dark:text-zinc-300">
                                {job.sport}
                              </span>
                              {job.employment_type && (
                                <span className="hidden sm:inline text-[11px] text-[#A89B80] dark:text-zinc-500">· {job.employment_type}</span>
                              )}
                            </div>

                            {/* 제목 */}
                            <p
                              className={`text-[15px] font-bold tracking-tight leading-snug ${
                                isOpen
                                  ? "text-[#2A251D] dark:text-zinc-100"
                                  : "text-[#8C8270] dark:text-zinc-500"
                              }`}
                            >
                              {job.title}
                            </p>

                            {/* 메타: 업체 / 지역 */}
                            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400 min-w-0">
                              {job.center_name && (
                                <>
                                  <svg className="w-3 h-3 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                  </svg>
                                  <span className="truncate font-medium">{job.center_name}</span>
                                  <span className="text-[#D6CCB6] dark:text-zinc-700">·</span>
                                </>
                              )}
                              <svg className="w-3 h-3 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="truncate">{job.region_name}</span>
                            </div>

                            {/* 하단 메타: 급여 / 날짜·조회수 */}
                            <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-[#F0E9D8] dark:border-zinc-800">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {job.salary ? (
                                  <>
                                    <svg className="w-3 h-3 text-[#6B7B3A] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="truncate text-[11px] font-bold text-[#6B7B3A]">{job.salary}</span>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-[#A89B80]">급여 정보 없음</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#A89B80] dark:text-zinc-500 shrink-0">
                                <span>{formatDate(job.created_at)}</span>
                                {typeof job.views === "number" && (
                                  <>
                                    <span className="text-[#D6CCB6] dark:text-zinc-700">·</span>
                                    <span className="inline-flex items-center gap-0.5">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      {job.views}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </Link>

                          {/* 액션 바 */}
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#FBF7EB]/60 dark:bg-zinc-800/40 border-t border-[#E8E0D0] dark:border-zinc-800">
                            {/* 삭제 확인 모드 */}
                            {deletingJobId === job.id ? (
                              <div className="flex-1 flex items-center gap-2">
                                <span className="text-[11px] text-[#C0392B] font-semibold">정말 삭제하시겠습니까?</span>
                                <button
                                  onClick={() => handleDeleteJob(job.id)}
                                  className="px-3 py-1.5 rounded-lg bg-[#C0392B] text-white text-[11px] font-bold hover:bg-[#A0311F]"
                                >삭제</button>
                                <button
                                  onClick={() => setDeletingJobId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-600 text-[11px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]"
                                >취소</button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => setDeletingJobId(job.id)}
                                  className="inline-flex items-center justify-center gap-1 text-[12px] font-semibold py-2 px-3 rounded-xl border border-[#C0392B]/40 text-[#C0392B] hover:bg-[#C0392B]/10 transition-colors"
                                >
                                  삭제
                                </button>
                                <button
                                  onClick={() => toggleJobClosed(job.id, job.is_closed)}
                                  className={`flex-1 inline-flex items-center justify-center gap-1 text-[12px] font-semibold py-2 rounded-xl border transition-colors ${
                                    job.is_closed
                                      ? "border-[#6B7B3A]/50 bg-transparent text-[#6B7B3A] hover:bg-[#6B7B3A]/10"
                                      : "border-[#E8E0D0] dark:border-zinc-600 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                                  }`}
                                >
                                  {job.is_closed ? (
                                    <>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                      </svg>
                                      다시 열기
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                      구인완료
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => router.push(`/jobs/write?clone=${job.id}`)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold py-2 rounded-xl bg-[#6B7B3A] text-white hover:bg-[#5A6930] shadow-[0_4px_12px_-6px_rgba(107,123,58,0.5)] transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.3} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  재게시
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {activeTab === "bookmarks" && (bookmarkPosts.length === 0 ? (
                <div className="px-4 py-10">
                  <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                    <div aria-hidden className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </div>
                      <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-1">북마크한 글이 없습니다</p>
                      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">마음에 드는 글을<br />저장해 아카이브로 모아보세요</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-6">
                  {/* 요약 바 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
                      <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Saved Posts</span>
                    </div>
                    <span className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                      총 <span className="font-bold text-[#6B7B3A]">{bookmarkPosts.length}</span>개
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {bookmarkPosts.map((p) => {
                      const initial = (p.author || "?").trim().charAt(0).toUpperCase() || "?";
                      return (
                        <li
                          key={p.id}
                          className="group relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_22px_-20px_rgba(107,93,71,0.3)] overflow-hidden"
                        >
                          {/* 우상단 북마크 리본 */}
                          <span
                            aria-hidden
                            className="absolute top-0 right-4 w-5 h-6 flex items-start justify-center bg-[#6B7B3A] text-white rounded-b-sm shadow-[0_4px_10px_-4px_rgba(107,123,58,0.6)]"
                          >
                            <svg className="w-2.5 h-2.5 mt-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" />
                            </svg>
                          </span>

                          <Link
                            href={`/category/${p.category_id}/post/${p.id}?from=${encodeURIComponent("/my?tab=bookmarks")}`}
                            className="block px-4 py-3.5 hover:bg-[#FBF7EB]/50 dark:hover:bg-zinc-800/40 transition-colors"
                          >
                            {/* 상단: 카테고리 칩 · 날짜 (북마크 리본 공간 확보) */}
                            <div className="flex items-center justify-between gap-2 mb-2 pr-10">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[11px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] truncate max-w-[60%]">
                                <span className="w-1 h-1 rounded-full bg-[#6B7B3A] shrink-0" />
                                <span className="truncate">{p.category_name || "게시판"}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#A89B80] dark:text-zinc-500 shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatDate(p.created_at)}
                              </span>
                            </div>

                            {/* 제목 */}
                            <p className="text-[14.5px] font-bold tracking-tight leading-snug text-[#2A251D] dark:text-zinc-100 line-clamp-2">
                              {p.title}
                            </p>

                            {/* 하단: 작성자 + 화살표 */}
                            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-[#F0E9D8] dark:border-zinc-800">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  aria-hidden
                                  className="w-5 h-5 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-[#6B7B3A] dark:text-[#A8B87A] shrink-0 border border-[#E8E0D0] dark:border-zinc-700"
                                >
                                  {initial}
                                </span>
                                <span className="truncate text-[11px] font-medium text-[#6B5D47] dark:text-zinc-400">
                                  {p.author || "익명"}
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A89B80] group-hover:text-[#6B7B3A] dark:text-zinc-500 transition-colors shrink-0">
                                열기
                                <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {activeTab === "jobBookmarks" && (bookmarkJobs.length === 0 ? (
                <div className="px-4 py-10">
                  <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                    <div aria-hidden className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-1">북마크한 구인글이 없습니다</p>
                      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">관심 있는 공고를<br />저장해 기회를 놓치지 마세요</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-6">
                  {/* 요약 바 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
                      <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Saved Jobs</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-[#8C8270] dark:text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6B7B3A]" />
                        모집중 <span className="font-bold text-[#6B7B3A]">{bookmarkJobs.filter((j) => !j.is_closed).length}</span>
                      </span>
                      <span className="text-[#E8E0D0] dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1 text-[#8C8270] dark:text-zinc-500">
                        종료 <span className="font-bold text-[#8C8270] dark:text-zinc-500">{bookmarkJobs.filter((j) => j.is_closed).length}</span>
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {bookmarkJobs.map((job) => {
                      const isOpen = !job.is_closed;
                      return (
                        <li
                          key={job.id}
                          className="group relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_28px_-22px_rgba(107,93,71,0.3)] overflow-hidden"
                        >
                          {/* 상단 악센트 (모집중일 때만) */}
                          {isOpen && (
                            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                          )}

                          {/* 우상단 북마크 리본 */}
                          <span
                            aria-hidden
                            className="absolute top-0 right-4 w-5 h-6 flex items-start justify-center bg-[#6B7B3A] text-white rounded-b-sm shadow-[0_4px_10px_-4px_rgba(107,123,58,0.6)] z-10"
                          >
                            <svg className="w-2.5 h-2.5 mt-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" />
                            </svg>
                          </span>

                          <Link
                            href={`/jobs/${job.id}?from=${encodeURIComponent("/my?tab=jobBookmarks")}`}
                            className="block px-4 pt-4 pb-3.5 hover:bg-[#FBF7EB]/50 dark:hover:bg-zinc-800/40 transition-colors"
                          >
                            {/* 상단 칩 줄 (리본 공간 확보) */}
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap pr-10">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                                  isOpen
                                    ? "bg-[#6B7B3A]/10 text-[#6B7B3A]"
                                    : "bg-[#EFE7D5] dark:bg-zinc-800 text-[#8C8270] dark:text-zinc-500"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-[#6B7B3A] animate-pulse" : "bg-[#A89B80]"}`} />
                                {isOpen ? "모집중" : "모집종료"}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[11px] font-semibold text-[#6B5D47] dark:text-zinc-300">
                                {job.sport}
                              </span>
                              {job.employment_type && (
                                <span className="hidden sm:inline text-[11px] text-[#A89B80] dark:text-zinc-500">· {job.employment_type}</span>
                              )}
                            </div>

                            {/* 제목 */}
                            <p
                              className={`text-[15px] font-bold tracking-tight leading-snug line-clamp-2 ${
                                isOpen
                                  ? "text-[#2A251D] dark:text-zinc-100"
                                  : "text-[#8C8270] dark:text-zinc-500"
                              }`}
                            >
                              {job.title}
                            </p>

                            {/* 메타: 업체 / 지역 */}
                            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400 min-w-0">
                              {job.center_name && (
                                <>
                                  <svg className="w-3 h-3 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                  </svg>
                                  <span className="truncate font-medium">{job.center_name}</span>
                                  <span className="text-[#D6CCB6] dark:text-zinc-700">·</span>
                                </>
                              )}
                              <svg className="w-3 h-3 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="truncate">{job.region_name}</span>
                            </div>

                            {/* 하단: 급여 + 열기 */}
                            <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-[#F0E9D8] dark:border-zinc-800">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {job.salary ? (
                                  <>
                                    <svg className="w-3 h-3 text-[#6B7B3A] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="truncate text-[11px] font-bold text-[#6B7B3A]">{job.salary}</span>
                                  </>
                                ) : job.deadline ? (
                                  <>
                                    <svg className="w-3 h-3 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="truncate text-[11px] text-[#8C8270] dark:text-zinc-500">{job.deadline}</span>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-[#A89B80]">급여 정보 없음</span>
                                )}
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A89B80] group-hover:text-[#6B7B3A] dark:text-zinc-500 transition-colors shrink-0">
                                열기
                                <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {activeTab === "notifications" && (notifications.length === 0 ? (
                <div className="px-4 py-10">
                  <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
                    <div aria-hidden className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-1">받은 알림이 없습니다</p>
                      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">중요한 소식이 도착하면<br />여기에서 바로 확인할 수 있어요</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-6">
                  {/* 모두 삭제 */}
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={() => setDeleteAllNotificationsDialog(true)}
                      className="text-[12px] font-bold text-[#C0392B] hover:text-[#A33121] px-2 py-1"
                    >
                      모두 삭제
                    </button>
                  </div>
                  {/* 요약 바 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
                      <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Updates</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-[#8C8270] dark:text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6B7B3A]" />
                        새 알림 <span className="font-bold text-[#6B7B3A]">{notifications.filter((n) => !n.is_read).length}</span>
                      </span>
                      <span className="text-[#E8E0D0] dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1 text-[#8C8270] dark:text-zinc-500">
                        전체 <span className="font-bold text-[#8C8270] dark:text-zinc-500">{notifications.length}</span>
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-2.5">
                    {notifications.map((n) => {
                      const isUnread = !n.is_read;
                      const typeLabel = n.broadcast_type === "event" ? "이벤트" : n.broadcast_type === "ad" ? "광고" : "공지";
                      const badgeCls =
                        n.broadcast_type === "event"
                          ? "bg-[#6B7B3A] text-white border border-[#6B7B3A]"
                          : n.broadcast_type === "ad"
                          ? "bg-[#F5E9C8] text-[#8A6D1E] dark:bg-[#3A2E15] dark:text-[#D4B05A] border border-[#E9C767]/50"
                          : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300 border border-[#E8E0D0] dark:border-zinc-700";
                      return (
                        <li
                          key={n.id}
                          ref={(el) => {
                            if (el && highlightId === n.id) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                            }
                          }}
                          onClick={async () => {
                            // 쪽지 알림이면 메시지 상세 모달 열기 (n.data에 messageId 있음)
                            if (n.type === "message" && n.data) {
                              try {
                                const parsed = typeof n.data === "string" ? JSON.parse(n.data) : n.data;
                                const messageId = Number(parsed?.messageId);
                                if (!messageId) return;
                                const token = await getIdToken();
                                if (!token) return;
                                const headers = { Authorization: `Bearer ${token}` };
                                const res = await fetch(`/api/messages/${messageId}`, { headers });
                                if (!res.ok) {
                                  alert("쪽지를 찾을 수 없습니다 (삭제됐을 수 있어요)");
                                  return;
                                }
                                const data = await res.json();
                                if (!data.original) return;
                                setMessageThread({ original: data.original, replies: data.replies || [] });
                              } catch {
                                alert("쪽지를 불러오지 못했습니다");
                              }
                            }
                          }}
                          className={`relative rounded-2xl overflow-hidden transition-colors ${
                            n.type === "message" ? "cursor-pointer" : ""
                          } ${
                            isUnread
                              ? "bg-[#FBF7EB] dark:bg-zinc-900/70 border border-[#6B7B3A]/35 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_26px_-22px_rgba(107,123,58,0.4)]"
                              : "bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                          } ${highlightId === n.id ? "noti-blink" : ""}`}
                        >
                          <div className="flex items-stretch">
                            {/* 읽지 않음 악센트 바 */}
                            <span
                              aria-hidden
                              className={`w-[3px] shrink-0 ${
                                isUnread
                                  ? "bg-gradient-to-b from-[#6B7B3A] via-[#6B7B3A]/60 to-[#6B7B3A]/15"
                                  : "bg-transparent"
                              }`}
                            />
                            <div className="flex-1 min-w-0 px-4 py-3.5">
                              {/* 상단: 타입 배지 · NEW · 시간 */}
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${badgeCls}`}>
                                  {typeLabel}
                                </span>
                                {isUnread && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#6B7B3A]/10 text-[#6B7B3A] text-[10px] font-bold tracking-wider">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#6B7B3A] animate-pulse" />
                                    NEW
                                  </span>
                                )}
                                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#A89B80] dark:text-zinc-500">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {formatDate(n.created_at)}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteNotificationDialog(n.id); }}
                                  aria-label="알림 삭제"
                                  className="ml-1 p-1 rounded-md text-[#A89B80] hover:text-[#C0392B] hover:bg-[#C0392B]/10 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>

                              {/* 제목 */}
                              <p
                                className={`text-[14px] leading-snug tracking-tight mb-1 ${
                                  isUnread
                                    ? "font-bold text-[#2A251D] dark:text-zinc-100"
                                    : "font-semibold text-[#6B5D47] dark:text-zinc-300"
                                }`}
                              >
                                {n.title}
                              </p>

                              {/* 본문 */}
                              <p className="text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400 whitespace-pre-line">
                                {n.body}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <style jsx global>{`
                @property --noti-angle {
                  syntax: "<angle>";
                  initial-value: 0deg;
                  inherits: false;
                }
                @keyframes noti-chase-spin {
                  to { --noti-angle: 360deg; }
                }
                @keyframes noti-chase-fade {
                  0%, 90% { opacity: 1; }
                  100% { opacity: 0; }
                }
                .noti-blink {
                  position: relative;
                  isolation: isolate;
                }
                .noti-blink::before {
                  content: "";
                  position: absolute;
                  inset: 0;
                  border-radius: inherit;
                  padding: 3px;
                  background: conic-gradient(
                    from var(--noti-angle, 0deg),
                    rgba(107, 123, 58, 0) 0deg,
                    rgba(107, 123, 58, 0.9) 60deg,
                    rgba(107, 123, 58, 0) 120deg,
                    rgba(107, 123, 58, 0) 360deg
                  );
                  -webkit-mask:
                    linear-gradient(#000 0 0) content-box,
                    linear-gradient(#000 0 0);
                  -webkit-mask-composite: xor;
                  mask:
                    linear-gradient(#000 0 0) content-box,
                    linear-gradient(#000 0 0);
                  mask-composite: exclude;
                  animation:
                    noti-chase-spin 1.6s linear,
                    noti-chase-fade 1.8s ease-out forwards;
                  pointer-events: none;
                  z-index: 1;
                }
              `}</style>

              {/* ── 받은 쪽지함 ── */}
              {activeTab === "receivedMessages" && (receivedMessages.length === 0 ? (
                <EmptyTabState icon={<svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} title="받은 쪽지가 없습니다" />
              ) : (
                <div className="px-4 pt-4 pb-6 space-y-2">
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={() => setDeleteAllMessagesDialog("received")}
                      className="text-[12px] font-bold text-[#C0392B] hover:text-[#A33121] px-2 py-1"
                    >
                      모두 삭제
                    </button>
                  </div>
                  {receivedMessages.map((m) => (
                    <MessageCard
                      key={m.id}
                      message={m}
                      type="received"
                      onClick={async () => {
                        const token = await getIdToken();
                        if (!token) return;
                        const headers = { Authorization: `Bearer ${token}` };
                        if (!m.is_read) fetch(`/api/messages/${m.id}/read`, { method: "POST", headers }).catch(() => {});
                        const res = await fetch(`/api/messages/${m.id}`, { headers });
                        const data = await res.json();
                        setMessageThread({ original: data.original, replies: data.replies || [] });
                      }}
                      onDelete={() => setDeleteMessageDialog({ id: m.id, type: "received" })}
                    />
                  ))}
                </div>
              ))}

              {/* ── 보낸 쪽지함 ── */}
              {activeTab === "sentMessages" && (sentMessages.length === 0 ? (
                <EmptyTabState icon={<svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>} title="보낸 쪽지가 없습니다" />
              ) : (
                <div className="px-4 pt-4 pb-6 space-y-2">
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={() => setDeleteAllMessagesDialog("sent")}
                      className="text-[12px] font-bold text-[#C0392B] hover:text-[#A33121] px-2 py-1"
                    >
                      모두 삭제
                    </button>
                  </div>
                  {sentMessages.map((m) => (
                    <MessageCard
                      key={m.id}
                      message={m}
                      type="sent"
                      onClick={async () => {
                        const token = await getIdToken();
                        if (!token) return;
                        const res = await fetch(`/api/messages/${m.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        const data = await res.json();
                        setMessageThread({ original: data.original, replies: data.replies || [] });
                      }}
                      onDelete={() => setDeleteMessageDialog({ id: m.id, type: "sent" })}
                    />
                  ))}
                </div>
              ))}

              {/* ── 차단된 사용자 ── */}
              {activeTab === "blocks" && (blockedUsers.length === 0 ? (
                <EmptyTabState
                  icon={
                    <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636" />
                    </svg>
                  }
                  title="차단된 사용자가 없습니다"
                />
              ) : (
                <div className="px-4 pt-4 pb-6 space-y-2">
                  {blockedUsers.map((b) => (
                    <div
                      key={b.blocked_uid}
                      className="flex items-center justify-between bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl px-4 py-3"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                          {b.blocked_nickname}
                        </span>
                        <span className="text-[11px] text-[#A89B80] dark:text-zinc-500">
                          {formatDateTime(b.created_at)} 차단
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnblock(b.blocked_nickname)}
                        disabled={unblockingNickname === b.blocked_nickname}
                        className="shrink-0 ml-3 px-3 py-1.5 text-[12px] font-bold text-[#6B7B3A] dark:text-[#A8B87A] border border-[#6B7B3A]/40 dark:border-[#A8B87A]/40 rounded-lg hover:bg-[#EFE7D5] dark:hover:bg-[#6B7B3A]/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {unblockingNickname === b.blocked_nickname ? "해제 중…" : "차단 해제"}
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {/* ── 쪽지 삭제 확인 (개별) ── */}
              {deleteMessageDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setDeleteMessageDialog(null)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-xs bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="px-5 pt-6 pb-4 text-center">
                      <h3 className="font-bold text-[15px] text-[#2A251D] dark:text-zinc-100 mb-2">쪽지 삭제</h3>
                      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">이 쪽지를 삭제하시겠습니까?</p>
                    </div>
                    <div className="flex border-t border-[#E8E0D0] dark:border-zinc-700">
                      <button
                        onClick={() => setDeleteMessageDialog(null)}
                        className="flex-1 py-3 text-[14px] font-medium text-[#3A342A] dark:text-zinc-200 border-r border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                      <button
                        onClick={confirmDeleteMessage}
                        className="flex-1 py-3 text-[14px] font-bold text-[#C0392B] hover:bg-[#FBEFEC] dark:hover:bg-red-900/20"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 쪽지 모두 삭제 확인 ── */}
              {deleteAllMessagesDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setDeleteAllMessagesDialog(null)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-xs bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="px-5 pt-6 pb-4 text-center">
                      <h3 className="font-bold text-[15px] text-[#2A251D] dark:text-zinc-100 mb-2">모두 삭제</h3>
                      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
                        {(deleteAllMessagesDialog === "received" ? receivedMessages : sentMessages).length}개의 쪽지를 모두 삭제하시겠습니까?
                      </p>
                    </div>
                    <div className="flex border-t border-[#E8E0D0] dark:border-zinc-700">
                      <button
                        onClick={() => setDeleteAllMessagesDialog(null)}
                        className="flex-1 py-3 text-[14px] font-medium text-[#3A342A] dark:text-zinc-200 border-r border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                      <button
                        onClick={confirmDeleteAllMessages}
                        className="flex-1 py-3 text-[14px] font-bold text-[#C0392B] hover:bg-[#FBEFEC] dark:hover:bg-red-900/20"
                      >
                        모두 삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 알림 개별 삭제 확인 ── */}
              {deleteNotificationDialog !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setDeleteNotificationDialog(null)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-xs bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="px-5 pt-6 pb-4 text-center">
                      <h3 className="font-bold text-[15px] text-[#2A251D] dark:text-zinc-100 mb-2">알림 삭제</h3>
                      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">이 알림을 삭제하시겠습니까?</p>
                    </div>
                    <div className="flex border-t border-[#E8E0D0] dark:border-zinc-700">
                      <button
                        onClick={() => setDeleteNotificationDialog(null)}
                        className="flex-1 py-3 text-[14px] font-medium text-[#3A342A] dark:text-zinc-200 border-r border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                      <button
                        onClick={confirmDeleteNotification}
                        className="flex-1 py-3 text-[14px] font-bold text-[#C0392B] hover:bg-[#FBEFEC] dark:hover:bg-red-900/20"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 알림 모두 삭제 확인 ── */}
              {deleteAllNotificationsDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setDeleteAllNotificationsDialog(false)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-xs bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="px-5 pt-6 pb-4 text-center">
                      <h3 className="font-bold text-[15px] text-[#2A251D] dark:text-zinc-100 mb-2">모두 삭제</h3>
                      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
                        {notifications.length}개의 알림을 모두 삭제하시겠습니까?
                      </p>
                    </div>
                    <div className="flex border-t border-[#E8E0D0] dark:border-zinc-700">
                      <button
                        onClick={() => setDeleteAllNotificationsDialog(false)}
                        className="flex-1 py-3 text-[14px] font-medium text-[#3A342A] dark:text-zinc-200 border-r border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                      <button
                        onClick={confirmDeleteAllNotifications}
                        className="flex-1 py-3 text-[14px] font-bold text-[#C0392B] hover:bg-[#FBEFEC] dark:hover:bg-red-900/20"
                      >
                        모두 삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 쪽지 상세 모달 ── */}
              {messageThread && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setMessageThread(null)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-md max-h-[80vh] bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E0D0] dark:border-zinc-700 shrink-0">
                      <h3 className="font-semibold text-[15px] text-[#2A251D] dark:text-zinc-100">쪽지 상세</h3>
                      <button onClick={() => setMessageThread(null)} className="text-[#999] hover:text-[#666]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                      {/* 원본 메시지 */}
                      <MessageBubble msg={messageThread.original} isOriginal />
                      {/* 답장들 */}
                      {messageThread.replies.map((r) => (
                        <MessageBubble key={r.id} msg={r} />
                      ))}
                    </div>
                    <div className="shrink-0 px-5 py-3 border-t border-[#E8E0D0] dark:border-zinc-700 flex gap-2">
                      <button
                        onClick={() => setMessageThread(null)}
                        className="flex-1 py-2.5 bg-[#F5F0E5] dark:bg-zinc-800 hover:bg-[#EFE7D5] dark:hover:bg-zinc-700 text-[#3A342A] dark:text-zinc-200 text-sm font-semibold rounded-xl transition-colors"
                      >
                        닫기
                      </button>
                      {(() => {
                        const orig = messageThread.original;
                        const isOwnSent = orig.sender_uid === user?.uid;
                        // 보낸 쪽지: 같은 수신자에게 새 thread 로 다시 보내기 (parentId 없음)
                        // 받은 쪽지: 보낸 사람에게 답장 (parentId = 원본 id)
                        return (
                          <button
                            onClick={() => {
                              const replyNickname = isOwnSent ? orig.receiver_nickname : orig.sender_nickname;
                              setReplyTo(isOwnSent
                                ? { nickname: replyNickname }
                                : { nickname: replyNickname, parentId: orig.id });
                              setShowReplyModal(true);
                            }}
                            className="flex-1 py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-sm font-semibold rounded-xl transition-colors"
                          >
                            {isOwnSent ? "다시보내기" : "답장하기"}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* 답장 모달 */}
              {replyTo && (
                <SendMessageModal
                  open={showReplyModal}
                  onClose={() => { setShowReplyModal(false); setReplyTo(null); }}
                  receiverNickname={replyTo.nickname}
                  parentId={replyTo.parentId}
                  onSent={() => {
                    if (replyTo.parentId) {
                      // 답장: 현재 스레드 새로고침
                      if (messageThread) {
                        getIdToken().then((token) => {
                          if (!token) return;
                          fetch(`/api/messages/${messageThread.original.id}`, { headers: { Authorization: `Bearer ${token}` } })
                            .then((r) => r.json())
                            .then((data) => setMessageThread({ original: data.original, replies: data.replies || [] }));
                        });
                      }
                    } else {
                      // 다시보내기: 새 thread 라 상세 모달은 닫고 보낸쪽지함 새로고침
                      setMessageThread(null);
                      loadTabData("sentMessages");
                    }
                  }}
                />
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
          <CardRow label="내가 쓴 글" count={counts.posts} onClick={() => router.push("/my?tab=posts")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
          <CardRow label="내가 쓴 댓글" count={counts.comments} onClick={() => router.push("/my?tab=comments")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>} />
          <CardRow label="후기 북마크" count={counts.bookmarks} onClick={() => router.push("/my?tab=bookmarks")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>} />
          <CardRow label="내가 등록한 구인글" count={counts.jobs} onClick={() => router.push("/my?tab=jobs")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
          <CardRow label="구인 북마크" count={counts.jobBookmarks} onClick={() => router.push("/my?tab=jobBookmarks")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>} />
          <CardRow label="알림 리스트" badge={unreadNotifications} onClick={() => router.push("/my?tab=notifications")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>} />
          <CardRow label="받은 쪽지함" count={counts.receivedMessages} nBadge={unreadMessages > 0} onClick={() => router.push("/my?tab=receivedMessages")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
          <CardRow label="보낸 쪽지함" count={counts.sentMessages} onClick={() => router.push("/my?tab=sentMessages")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>} />
          <CardRow label="차단된 사용자" count={counts.blocks} onClick={() => router.push("/my?tab=blocks")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636" /></svg>} />
        </Card>

        {/* ── 3. 설정 카드 ── */}
        <Card title="설정">
          <SettingRow label="키워드 설정" onClick={() => router.push("/keywords")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>} />
          <SettingRow label="문의하기" onClick={() => router.push("/inquiry")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
          <SettingRow label="이용약관" onClick={() => window.open("/terms.html", "_blank")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
          <SettingRow label="개인정보처리방침" onClick={() => window.open("/privacy.html", "_blank")} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>} />
          <SettingRow label="로그아웃" onClick={signOutUser} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>} />
          <SettingRow label="탈퇴하기" onClick={() => setShowDeleteConfirm(true)} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>} danger />
        </Card>

        {/* 앱 버전 */}
        <p className="text-center text-xs text-[#CCC] py-4">앱 버전 1.9.9</p>
      </div>

      {/* ══════ 모달들 ══════ */}

      {/* 닉네임 모달 — 최초 설정 시엔 닫을 수 없음 (nickname 없으면 강제 */}
      <Modal
        open={showNicknameModal}
        onClose={() => setShowNicknameModal(false)}
        title="닉네임 설정"
        dismissible={!!nickname}
      >
        {!canChange ? (
          <div className="text-center py-4">
            <p className="text-sm text-[#666] dark:text-zinc-400">닉네임 변경은 <strong className="text-[#6B7B3A]">{remainingDays}일 후</strong>에 가능합니다</p>
          </div>
        ) : (
          <>
            <input
              id="nickname-input"
              type="text"
              value={nicknameInput}
              onChange={(e) => { setNicknameInput(e.target.value); if (nicknameError) setNicknameError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSaveNickname()}
              placeholder="2~8글자"
              maxLength={8}
              autoFocus
              className={`w-full px-3 py-2.5 bg-[#F5F0E5] dark:bg-zinc-800 border rounded-xl text-sm text-[#333] dark:text-zinc-100 placeholder-[#CCC] focus:outline-none focus:ring-2 transition-colors mb-2 ${
                nicknameError
                  ? "border-red-400 focus:ring-red-400"
                  : "border-[#E8E0D0] dark:border-zinc-600 focus:ring-[#6B7B3A]"
              }`}
            />
            {/* 안내 문구 + 랜덤 추천 */}
            <div className="flex items-center justify-between gap-2 mb-3 px-0.5">
              <p className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                설정된 닉네임은 3주간 변경이 불가합니다.
              </p>
              <button
                type="button"
                onClick={() => { setNicknameInput(generateRandomNickname()); setNicknameError(""); }}
                className="text-[11px] font-semibold text-[#6B7B3A] hover:text-[#5A6930] hover:underline shrink-0 inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                랜덤 추천
              </button>
            </div>
            {nicknameError && (
              <p className="text-xs text-red-500 font-semibold mb-2 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {nicknameError}
              </p>
            )}
            <button
              onClick={handleSaveNickname}
              disabled={nicknameLoading}
              className="w-full py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-medium rounded-xl text-sm disabled:opacity-50 transition-colors"
            >{nicknameLoading ? "저장 중..." : "저장하기"}</button>
          </>
        )}
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

function EmptyTabState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="px-4 py-10">
      <div className="relative mx-auto max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-6 py-10 text-center overflow-hidden">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">{icon}</div>
        <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">{title}</p>
      </div>
    </div>
  );
}

function MessageCard({ message, type, onClick, onDelete }: { message: Message; type: "received" | "sent"; onClick: () => void; onDelete?: () => void }) {
  const isUnread = type === "received" && !message.is_read;
  const otherName = type === "received" ? message.sender_nickname : message.receiver_nickname;
  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-colors ${
        isUnread
          ? "bg-[#FBF7EB] dark:bg-zinc-900/70 border border-[#6B7B3A]/35 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_26px_-22px_rgba(107,123,58,0.4)]"
          : "bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700"
      }`}
    >
      <button onClick={onClick} className="w-full text-left">
        <div className="px-4 py-3.5 pr-12">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-bold text-[#3A342A] dark:text-zinc-200">
              {type === "received" ? "보낸 사람" : "받는 사람"}: {otherName}
            </span>
            {isUnread && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#C0392B] text-white text-[10px] font-bold leading-none">
                N
              </span>
            )}
            <span className="ml-auto text-[11px] text-[#A89B80] dark:text-zinc-500">{formatDate(message.created_at)}</span>
          </div>
          <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 line-clamp-2 leading-relaxed">{message.content}</p>
        </div>
      </button>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="삭제"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#A89B80] hover:text-[#C0392B] dark:text-zinc-500 dark:hover:text-[#E74C3C] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
          </svg>
        </button>
      )}
    </div>
  );
}

function MessageBubble({ msg, isOriginal }: { msg: Message; isOriginal?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${isOriginal ? "bg-[#F5F0E5] dark:bg-zinc-800" : "bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-bold text-[#3A342A] dark:text-zinc-200">{msg.sender_nickname}</span>
        <span className="text-[11px] text-[#A89B80] dark:text-zinc-500">{formatDateTime(msg.created_at)}</span>
      </div>
      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-300 leading-relaxed whitespace-pre-line">{msg.content}</p>
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
