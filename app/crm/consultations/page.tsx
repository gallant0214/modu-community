"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";
import { crmInputClass } from "../_components/crm-modal";
import { CONSULT_STATUS_COLOR, CONSULT_STATUS_LABEL } from "./_labels";
import { ConsultationForm } from "./_components/consultation-form";
import type { TemplateDefinition } from "@/app/lib/crm-consultation-template";

interface Template {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  active: boolean;
  definition?: TemplateDefinition | null;
}

interface Row {
  id: number;
  member_id: number | null;
  name: string;
  gender: string | null;
  birth: string | null;
  phone: string | null;
  address_dong: string | null;
  trainer_member_id: number | null;
  trainer_name: string | null;
  goals: string[] | null;
  status: string;
  converted_at: string | null;
  converted_pass_id: number | null;
  consulted_at: string;
}

interface Stats {
  total: { total: number; converted: number; lost: number; open: number };
  conversion_rate: number;
  by_trainer: {
    trainer_member_id: number | null;
    trainer_name: string;
    total: number;
    converted: number;
    lost: number;
    open: number;
    conversion_rate: number;
  }[];
}

type Tab = "new" | "list" | "manage";

const TABS: { v: Tab; l: string }[] = [
  { v: "new", l: "PT 상담지" },
  { v: "list", l: "PT 상담 리스트" },
  { v: "manage", l: "PT 상담지 관리" },
];

export default function ConsultationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "new" || tabParam === "manage" ? tabParam : "list";

  const setTab = (t: Tab) => {
    const q = new URLSearchParams(searchParams.toString());
    if (t === "list") q.delete("tab");
    else q.set("tab", t);
    const qs = q.toString();
    router.replace(`/crm/consultations${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          PT 상담
        </h1>
        <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
          종이 상담지를 대체 · 상담 → PT 등록 전환률을 자동 집계합니다.
        </p>

        {/* 최상단 3-탭 */}
        <div className="mt-3 flex gap-1 border-b border-[#E8E0D0] dark:border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => setTab(t.v)}
              className={`relative px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                tab === t.v
                  ? "text-[#6B7B3A] dark:text-[#A8B87A]"
                  : "text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A]"
              }`}
            >
              {t.l}
              {tab === t.v && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-[#6B7B3A] dark:bg-[#A8B87A] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </header>

      {tab === "new" && <NewTab />}

      {tab === "list" && <ListTab />}

      {tab === "manage" && <ManageTab />}
    </div>
  );
}

/** PT 상담지 탭 — 템플릿 선택 후 폼 노출 */
function NewTab() {
  const { getIdToken } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch("/api/crm/consultations/templates", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setTemplates(data.templates ?? []);
        const def =
          (data.templates as Template[]).find((t) => t.is_default) ?? (data.templates ?? [])[0];
        if (def) setSelected(def.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [getIdToken]);

  if (loading) {
    return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
    );
  }

  const selectedTpl = templates.find((t) => t.id === selected);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100">
            상담지 선택
          </h2>
          <Link
            href="/crm/consultations?tab=manage"
            className="text-[11.5px] font-semibold text-[#6B7B3A] hover:underline"
          >
            + 상담지 관리 →
          </Link>
        </div>
        <select
          className={crmInputClass}
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}
        >
          {templates.length === 0 && <option value="">등록된 상담지가 없어요</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.is_default ? " (기본)" : ""}
            </option>
          ))}
        </select>
        {selectedTpl?.description && (
          <p className="mt-2 text-[11.5px] text-[#A89B80]">{selectedTpl.description}</p>
        )}
      </section>

      <ConsultationForm
        mode="create"
        templateId={selected}
        templateDefinition={selectedTpl?.definition ?? null}
      />
    </div>
  );
}

function ListTab() {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(
        `/api/crm/consultations?limit=500${statusFilter ? `&status=${statusFilter}` : ""}${
          query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""
        }`,
        { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setRows(data.consultations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, statusFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1.5">
          {(
            [
              { v: "", l: "전체" },
              { v: "open", l: "진행중" },
              { v: "converted", l: "PT 등록" },
              { v: "lost", l: "미등록" },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setStatusFilter(f.v)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                statusFilter === f.v
                  ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[#3A342A] dark:text-zinc-300"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 연락처 검색"
            className="w-full h-9 px-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] focus:outline-none focus:border-[#6B7B3A]"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : error ? (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[#8C8270]">
          상담 기록이 없습니다.
        </div>
      ) : (
        <ConsultationList rows={rows} />
      )}
    </section>
  );
}

function ManageTab() {
  const { getIdToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const [statsRes, tplRes] = await Promise.all([
        fetch(`/api/crm/consultations/stats`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`/api/crm/consultations/templates`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const statsData = await statsRes.json();
      const tplData = await tplRes.json();
      if (!statsRes.ok) throw new Error(statsData?.error || "조회 실패");
      if (!tplRes.ok) throw new Error(tplData?.error || "템플릿 조회 실패");
      setStats(statsData);
      setTemplates(tplData.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const router = useRouter();
  const createTemplate = async () => {
    setAddError("");
    if (!newName.trim()) return setAddError("상담지 이름을 입력해 주세요");
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/consultations/templates`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      // 만들자마자 편집 화면으로 이동해 섹션·항목을 구성하도록 유도
      const newId = data.template?.id;
      setNewName("");
      setNewDesc("");
      setShowAdd(false);
      if (newId) {
        router.push(`/crm/consultations/templates/${newId}`);
        return;
      }
      await loadAll();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: number) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/consultations/templates/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      await loadAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  const removeTemplate = async (id: number) => {
    if (!window.confirm("이 상담지 템플릿을 삭제할까요? 이미 저장된 상담 기록은 유지됩니다.")) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/consultations/templates/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      await loadAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  if (loading) {
    return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
    );
  }
  const total = stats?.total.total ?? 0;
  return (
    <div className="space-y-4">
      {/* 상담지 관리 */}
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100">
            PT 상담지 관리
          </h2>
          {!showAdd && (
            <button
              type="button"
              onClick={() => {
                setShowAdd(true);
                setAddError("");
              }}
              className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
            >
              + PT 상담지 만들기
            </button>
          )}
        </div>

        {showAdd && (
          <div className="mb-3 p-3 rounded-xl border border-[#6B7B3A]/40 bg-[#F3F7EA]/40 dark:bg-emerald-950/20 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="상담지 이름 (예: 다이어트 특화 상담지)"
              className="w-full h-10 px-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="설명 (선택) — 어떤 상황에 사용하는지 짧게 기록"
              className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
            />
            {addError && (
              <div className="text-[12px] text-red-700">{addError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setAddError("");
                }}
                className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] text-[12.5px] text-[#3A342A] hover:bg-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={createTemplate}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
              >
                {saving ? "만드는 중…" : "상담지 만들기"}
              </button>
            </div>
          </div>
        )}

        {templates.length === 0 ? (
          <p className="text-[12.5px] text-[#A89B80] text-center py-4">
            상담지가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-950"
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                    {t.name}
                    {t.is_default && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-[#F3F7EA] text-[#4D622C] border border-[#DDE8C5]">
                        기본
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <div className="mt-0.5 text-[11.5px] text-[#8C8270] truncate">
                      {t.description}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {!t.is_default && (
                    <Link
                      href={`/crm/consultations/templates/${t.id}`}
                      className="px-2 py-1 rounded-md border border-[#6B7B3A] text-[11.5px] text-[#6B7B3A] hover:bg-[#F3F7EA]"
                    >
                      편집
                    </Link>
                  )}
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(t.id)}
                      className="px-2 py-1 rounded-md border border-[#E8E0D0] text-[11.5px] text-[#3A342A] hover:bg-[#F5F0E5]"
                    >
                      기본 지정
                    </button>
                  )}
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => removeTemplate(t.id)}
                      className="px-2 py-1 rounded-md border border-red-200 text-[11.5px] text-red-700 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiTile label="전체 상담" value={total} suffix="건" />
        <KpiTile
          label="PT 등록 전환"
          value={stats?.total.converted ?? 0}
          suffix="건"
          tone="green"
        />
        <KpiTile label="미등록" value={stats?.total.lost ?? 0} suffix="건" />
        <KpiTile
          label="전환률"
          value={stats?.conversion_rate ?? 0}
          suffix="%"
          tone="green"
          isRate
        />
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
        <h2 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2.5">
          담당 강사별 전환률
        </h2>
        {(stats?.by_trainer.length ?? 0) === 0 ? (
          <p className="text-[12.5px] text-[#A89B80] py-4 text-center">
            아직 상담 기록이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-[12.5px]">
              <thead className="text-[#8C8270] dark:text-zinc-500 border-b border-[#E8E0D0] dark:border-zinc-800">
                <tr>
                  <th className="text-left py-1.5 pr-2 font-semibold">강사</th>
                  <th className="text-right py-1.5 px-2 font-semibold">상담</th>
                  <th className="text-right py-1.5 px-2 font-semibold">PT 등록</th>
                  <th className="text-right py-1.5 px-2 font-semibold">미등록</th>
                  <th className="text-right py-1.5 px-2 font-semibold">진행중</th>
                  <th className="text-right py-1.5 pl-2 font-semibold">전환률</th>
                </tr>
              </thead>
              <tbody className="text-[#2A251D] dark:text-zinc-200">
                {stats?.by_trainer.map((t) => (
                  <tr
                    key={
                      (t.trainer_member_id ?? 0).toString() + "|" + (t.trainer_name ?? "")
                    }
                    className="border-b border-[#E8E0D0]/60 dark:border-zinc-800/70 last:border-b-0"
                  >
                    <td className="py-2 pr-2 font-semibold">{t.trainer_name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{t.total}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {t.converted}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[#8C8270]">
                      {t.lost}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                      {t.open}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
                      {t.conversion_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ConsultationList({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-[13px]">
        <thead className="text-[#8C8270] dark:text-zinc-500 border-b border-[#E8E0D0] dark:border-zinc-800">
          <tr>
            <th className="text-left py-2 pr-2 font-semibold">상담일</th>
            <th className="text-left py-2 pr-2 font-semibold">이름</th>
            <th className="text-left py-2 pr-2 font-semibold">연락처</th>
            <th className="text-left py-2 pr-2 font-semibold">담당 강사</th>
            <th className="text-left py-2 pr-2 font-semibold">회원</th>
            <th className="text-left py-2 font-semibold">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[#E8E0D0]/60 dark:border-zinc-800/70 last:border-b-0"
            >
              <td className="py-2 pr-2 tabular-nums text-[#6B5D47]">{r.consulted_at}</td>
              <td className="py-2 pr-2 font-semibold text-[#2A251D] dark:text-zinc-100">
                <Link href={`/crm/consultations/${r.id}`} className="hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-2 text-[#6B5D47]">
                {r.phone ? formatPhone(r.phone) : "—"}
              </td>
              <td className="py-2 pr-2 text-[#6B5D47]">{r.trainer_name ?? "미지정"}</td>
              <td className="py-2 pr-2">
                {r.member_id ? (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#F3F7EA] text-[#4D622C] border border-[#DDE8C5]">
                    센터 회원
                  </span>
                ) : (
                  <span className="text-[11.5px] text-[#A89B80]">방문객</span>
                )}
              </td>
              <td className="py-2">
                <StatusChip status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls = CONSULT_STATUS_COLOR[status] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {CONSULT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function KpiTile({
  label,
  value,
  suffix,
  tone,
  isRate,
}: {
  label: string;
  value: number;
  suffix: string;
  tone?: "green";
  isRate?: boolean;
}) {
  const cls =
    tone === "green"
      ? "border-[#DDE8C5] bg-[#F3F7EA]/70 text-[#4D622C]"
      : "border-[#E8E0D0] bg-white text-[#2A251D]";
  return (
    <div className={`rounded-xl border p-3 dark:bg-zinc-900 dark:border-zinc-800 ${cls}`}>
      <div className="text-[11px] font-semibold opacity-70">{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums dark:text-zinc-100">
        {isRate ? value.toFixed(1) : value.toLocaleString()}
        <span className="ml-1 text-[12px] font-semibold opacity-70">{suffix}</span>
      </div>
    </div>
  );
}
