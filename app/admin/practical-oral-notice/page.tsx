"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import RichEditor from "@/app/components/rich-editor";

type Audience = "main" | "disabled";

interface Notice {
  id: number;
  audience: Audience;
  slug: string;
  icon: string | null;
  badge: string | null;
  title: string;
  summary: string;
  content: string;
  display_order: number;
  is_active: boolean;
  updated_at: string;
}

const EMPTY_FORM: Omit<Notice, "id" | "updated_at"> = {
  audience: "main",
  slug: "",
  icon: "",
  badge: "",
  title: "",
  summary: "",
  content: "",
  display_order: 99,
  is_active: true,
};

export default function PracticalOralNoticeAdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [audience, setAudience] = useState<Audience>("main");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState<Omit<Notice, "id" | "updated_at">>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [pushing, setPushing] = useState<number | null>(null);

  const loadNotices = useCallback(async (pw: string, aud: Audience) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/practical-oral-notice?password=${encodeURIComponent(pw)}&audience=${aud}`);
      const d = await res.json();
      if (d.error) {
        setError(d.error);
        return;
      }
      setNotices(d.notices || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) loadNotices(password, audience);
  }, [authenticated, audience, loadNotices, password]);

  async function handleLogin() {
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/practical-oral-notice?password=${encodeURIComponent(password)}&audience=main`);
      const d = await res.json();
      if (d.error) {
        setError(d.error);
        return;
      }
      setNotices(d.notices || []);
      setAuthenticated(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, audience, display_order: notices.length + 1 });
  }

  function startEdit(n: Notice) {
    setEditing(n);
    setForm({
      audience: n.audience,
      slug: n.slug,
      icon: n.icon || "",
      badge: n.badge || "",
      title: n.title,
      summary: n.summary,
      content: n.content,
      display_order: n.display_order,
      is_active: n.is_active,
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.slug.trim() || !form.title.trim()) {
      setError("slug와 title은 필수입니다");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url = editing
        ? `/api/admin/practical-oral-notice/${editing.id}`
        : `/api/admin/practical-oral-notice`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, ...form }),
      });
      const d = await res.json();
      if (d.error) {
        setError(d.error);
        return;
      }
      cancelEdit();
      await loadNotices(password, audience);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/practical-oral-notice/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (d.error) {
        setError(d.error);
        return;
      }
      await loadNotices(password, audience);
    } finally {
      setLoading(false);
    }
  }

  async function handlePush(id: number) {
    if (!confirm("이 공지를 푸시 알림으로 전체 이용자에게 발송하시겠습니까?")) return;
    setPushing(id);
    try {
      const res = await fetch(`/api/admin/practical-oral-notice/${id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (d.error) {
        alert(`오류: ${d.error}`);
        return;
      }
      alert(`발송 완료\n대상: ${d.totalTargets}명\n성공: ${d.sentCount}\n실패: ${d.failCount}`);
    } finally {
      setPushing(null);
    }
  }

  async function toggleActive(n: Notice) {
    setLoading(true);
    try {
      await fetch(`/api/admin/practical-oral-notice/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, is_active: !n.is_active }),
      });
      await loadNotices(password, audience);
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-6 shadow-lg">
          <Link href="/admin" className="text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:underline">← 관리자 홈</Link>
          <h1 className="text-xl font-bold mt-3 mb-1 text-[#2A251D] dark:text-zinc-100">실기·구술 공지 관리</h1>
          <p className="text-[13px] text-[#A89B80] mb-4">관리자 비밀번호를 입력하세요</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="비밀번호"
            className="w-full px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#2A251D] dark:text-zinc-100"
          />
          {error && <p className="text-red-600 text-[13px] mt-2">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white font-bold hover:bg-[#5a6830] disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </div>
      </div>
    );
  }

  const isEditing = editing !== null || form.title.length > 0 || form.slug.length > 0;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 px-4 py-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href="/admin" className="text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:underline">← 관리자 홈</Link>
            <h1 className="text-2xl font-bold mt-1 text-[#2A251D] dark:text-zinc-100">실기·구술 공지 관리</h1>
          </div>
          <button onClick={startNew} className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white font-bold hover:bg-[#5a6830]">+ 새 공지</button>
        </div>

        {/* audience 탭 */}
        <div className="flex gap-2 mb-4">
          {(["main", "disabled"] as const).map((a) => (
            <button
              key={a}
              onClick={() => { setAudience(a); cancelEdit(); }}
              className={`px-4 py-2 rounded-lg text-[14px] font-bold transition-colors ${audience === a ? "bg-[#6B7B3A] text-white" : "bg-white dark:bg-zinc-800 text-[#3A342A] dark:text-zinc-200 border border-[#E8E0D0] dark:border-zinc-700"}`}
            >
              {a === "main" ? "🏢 일반 (대한체육회)" : "♿ 장애인체육회"}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4 text-[13px]">{error}</div>}

        {/* 편집 폼 */}
        {isEditing && (
          <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-5 mb-6">
            <h2 className="text-lg font-bold mb-4 text-[#2A251D] dark:text-zinc-100">{editing ? "공지 수정" : "새 공지 작성"}</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Field label="대상" required>
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as Audience })} className={inputCls}>
                  <option value="main">일반</option>
                  <option value="disabled">장애인</option>
                </select>
              </Field>
              <Field label="순서" required>
                <input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="아이콘 (이모지)">
                <input value={form.icon || ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🔥" className={inputCls} />
              </Field>
              <Field label="뱃지">
                <input value={form.badge || ""} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="NEW" className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <Field label="slug (영문 식별자)" required>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="policy-changes" className={inputCls} />
              </Field>
              <Field label="활성">
                <label className="flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <span className="text-[14px]">노출</span>
                </label>
              </Field>
            </div>

            <Field label="제목 (카드 타이틀)" required>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
            </Field>

            <Field label="요약 (카드 부제)">
              <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className={inputCls} />
            </Field>

            <Field label="본문">
              <RichEditor content={form.content} onChange={(html) => setForm({ ...form, content: html })} />
            </Field>

            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={loading} className="px-5 py-2 rounded-lg bg-[#6B7B3A] text-white font-bold hover:bg-[#5a6830] disabled:opacity-50">
                {loading ? "저장 중..." : "저장"}
              </button>
              <button onClick={cancelEdit} className="px-5 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[#3A342A] dark:text-zinc-200">취소</button>
            </div>
          </div>
        )}

        {/* 목록 */}
        <div className="space-y-2">
          {notices.length === 0 ? (
            <p className="text-[#A89B80] text-center py-12">등록된 공지가 없습니다</p>
          ) : (
            notices.map((n) => (
              <div key={n.id} className={`bg-[#FEFCF7] dark:bg-zinc-900 border rounded-xl p-4 ${n.is_active ? "border-[#E8E0D0] dark:border-zinc-700" : "border-zinc-300 dark:border-zinc-600 opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{n.icon || "📄"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] text-[#A89B80] font-mono">#{n.display_order}</span>
                      {n.badge && <span className="text-[11px] bg-[#C0392B] text-white px-2 py-0.5 rounded font-bold">{n.badge}</span>}
                      <h3 className="font-bold text-[#2A251D] dark:text-zinc-100 truncate">{n.title}</h3>
                      {!n.is_active && <span className="text-[11px] bg-zinc-400 text-white px-2 py-0.5 rounded">비활성</span>}
                    </div>
                    <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 mt-1 line-clamp-1">{n.summary}</p>
                    <p className="text-[11px] text-[#A89B80] mt-1 font-mono">{n.slug} · 수정: {new Date(n.updated_at).toLocaleString("ko-KR")}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => startEdit(n)} className="px-3 py-1 rounded text-[12px] bg-[#6B7B3A] text-white hover:bg-[#5a6830]">수정</button>
                    <button onClick={() => toggleActive(n)} className="px-3 py-1 rounded text-[12px] border border-[#E8E0D0] dark:border-zinc-700">
                      {n.is_active ? "숨김" : "노출"}
                    </button>
                    <button onClick={() => handlePush(n.id)} disabled={pushing === n.id} className="px-3 py-1 rounded text-[12px] bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                      {pushing === n.id ? "발송중..." : "📢 푸시"}
                    </button>
                    <button onClick={() => handleDelete(n.id)} className="px-3 py-1 rounded text-[12px] bg-red-100 text-red-700 hover:bg-red-200">삭제</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[14px] text-[#2A251D] dark:text-zinc-100";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="block text-[12px] font-bold text-[#6B5D47] dark:text-zinc-400 mb-1">
        {label}{required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
