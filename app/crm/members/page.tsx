"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { MEMBER_TYPE_LABEL, formatPhone } from "../_components/crm-labels";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";

interface PassItem {
  kind: string;
  type: "lesson" | "membership";
  remaining: number | null;
  expires: string;
}

interface MemberRow {
  id: number;
  member_type: string;
  name: string;
  phone: string;
  email: string | null;
  birth: string | null;
  gender: string | null;
  linked_firebase_uid: string | null;
  memo: string | null;
  status: string;
  address: string | null;
  visit_route: string | null;
  workout_goal: string | null;
  counselor: string | null;
  mileage: number;
  marketing_consent: boolean;
  created_at: string;
  items?: PassItem[];
  locker_label?: string | null;
  last_visit_at?: string | null;
  max_expires_at?: string | null;
}

type StatusFilter = "all" | "valid" | "expired";
type SignupFilter = "all" | "this_week" | "this_month" | "this_year" | "custom";
type AbsenceFilter = "all" | "10d" | "20d" | "30d" | "60d" | "90d";
type ExpireFilter = "all" | "this_week" | "this_month" | "expired";
type LockerFilter = "all" | "has" | "none";
type GoodsFilter = "all" | "has" | "none";

const PAGE_SIZE = 25;

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysBetween = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / (24 * 3600 * 1000));

export default function CrmMembersPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // 필터
  const [fStatus, setFStatus] = useState<StatusFilter>("all");
  const [fSignup, setFSignup] = useState<SignupFilter>("all");
  const [fSignupFrom, setFSignupFrom] = useState("");
  const [fSignupTo, setFSignupTo] = useState("");
  const [fAbsence, setFAbsence] = useState<AbsenceFilter>("all");
  const [fExpire, setFExpire] = useState<ExpireFilter>("all");
  const [fLocker, setFLocker] = useState<LockerFilter>("all");
  const [fGoods, setFGoods] = useState<GoodsFilter>("all");

  const [page, setPage] = useState(1);

  // 액션 모드 (회원 삭제)
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/members?detail=1&limit=200`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  // 검색 + 필터 적용
  const filtered = useMemo(() => {
    const t0 = today();
    const startOfWeek = new Date(t0);
    startOfWeek.setDate(t0.getDate() - t0.getDay());
    const startOfMonth = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const startOfYear = new Date(t0.getFullYear(), 0, 1);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    const endOfMonth = new Date(t0.getFullYear(), t0.getMonth() + 1, 1);
    const todayStr = t0.toISOString().slice(0, 10);

    const q = query.trim().toLowerCase();

    return list.filter((m) => {
      if (q) {
        const hit =
          m.name.toLowerCase().includes(q) ||
          (m.phone || "").replace(/-/g, "").includes(q.replace(/-/g, ""));
        if (!hit) return false;
      }

      // 상태
      if (fStatus !== "all") {
        const isValid = m.max_expires_at && m.max_expires_at >= todayStr;
        if (fStatus === "valid" && !isValid) return false;
        if (fStatus === "expired" && isValid) return false;
      }

      // 가입일
      if (fSignup !== "all") {
        const created = new Date(m.created_at);
        if (fSignup === "this_week" && (created < startOfWeek || created >= endOfWeek)) return false;
        if (fSignup === "this_month" && (created < startOfMonth || created >= endOfMonth)) return false;
        if (fSignup === "this_year" && created < startOfYear) return false;
        if (fSignup === "custom") {
          const createdYmd = m.created_at.slice(0, 10);
          if (fSignupFrom && createdYmd < fSignupFrom) return false;
          if (fSignupTo && createdYmd > fSignupTo) return false;
        }
      }

      // 미방문 기간
      if (fAbsence !== "all") {
        const last = m.last_visit_at ? new Date(m.last_visit_at) : null;
        const days = last ? daysBetween(t0, last) : Infinity;
        const threshold: Record<Exclude<AbsenceFilter, "all">, number> = {
          "10d": 10,
          "20d": 20,
          "30d": 30,
          "60d": 60,
          "90d": 90,
        };
        if (days < threshold[fAbsence]) return false;
      }

      // 최종 만료일
      if (fExpire !== "all") {
        if (fExpire === "expired") {
          if (!m.max_expires_at || m.max_expires_at >= todayStr) return false;
        } else if (fExpire === "this_week") {
          if (!m.max_expires_at) return false;
          const d = new Date(m.max_expires_at);
          if (d < startOfWeek || d >= endOfWeek) return false;
        } else if (fExpire === "this_month") {
          if (!m.max_expires_at) return false;
          const d = new Date(m.max_expires_at);
          if (d < startOfMonth || d >= endOfMonth) return false;
        }
      }

      // 락커
      if (fLocker !== "all") {
        if (fLocker === "has" && !m.locker_label) return false;
        if (fLocker === "none" && m.locker_label) return false;
      }

      // 운동 용품 (현재 회원별 구매 데이터 미보유 — 항상 0건 통과)
      if (fGoods === "has") return false;

      return true;
    });
  }, [list, query, fStatus, fSignup, fSignupFrom, fSignupTo, fAbsence, fExpire, fLocker, fGoods]);

  const totals = useMemo(() => {
    const todayStr = today().toISOString().slice(0, 10);
    let valid = 0;
    let expired = 0;
    for (const m of list) {
      if (m.max_expires_at && m.max_expires_at >= todayStr) valid += 1;
      else expired += 1;
    }
    return { all: list.length, valid, expired };
  }, [list]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, fStatus, fSignup, fSignupFrom, fSignupTo, fAbsence, fExpire, fLocker, fGoods]);

  const resetFilters = () => {
    setQuery("");
    setFStatus("all");
    setFSignup("all");
    setFSignupFrom("");
    setFSignupTo("");
    setFAbsence("all");
    setFExpire("all");
    setFLocker("all");
    setFGoods("all");
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const allChecked = pageRows.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const enterDeleteMode = () => {
    setDeleteMode(true);
    setSelected(new Set());
  };
  const cancelDeleteMode = () => {
    setDeleteMode(false);
    setSelected(new Set());
  };

  const confirmDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}명을 삭제할까요?`)) return;
    const token = await getIdToken();
    if (!token) return;
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/crm/members/${id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        })
      )
    );
    cancelDeleteMode();
    load();
  };

  const downloadExcel = () => {
    const header = [
      "이름",
      "회원 앱",
      "연락처",
      "가입일",
      "상태",
      "회원 유형",
      "최근 방문일",
      "이용 가능 상품",
      "최종 만료일",
      "락커",
      "주소",
      "방문 경로",
      "운동 목적",
      "상담 담당자",
      "마일리지",
      "광고성 수신",
    ];
    const todayStr = today().toISOString().slice(0, 10);
    const rows = filtered.map((m) => [
      m.name,
      m.linked_firebase_uid ? "연동" : "미연동",
      m.phone ? formatPhone(m.phone) : "",
      formatDate(m.created_at),
      m.max_expires_at && m.max_expires_at >= todayStr ? "유효" : "만료",
      MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type,
      m.last_visit_at ? formatDateTime(m.last_visit_at) : "",
      (m.items ?? [])
        .map(
          (it) =>
            `${it.type === "membership" ? "회원권" : "수강권"}|${it.kind}|${
              it.remaining ?? ""
            }|${it.expires}`
        )
        .join(";"),
      m.max_expires_at ?? "",
      m.locker_label ?? "",
      m.address ?? "",
      m.visit_route ?? "",
      m.workout_goal ?? "",
      m.counselor ?? "",
      String(m.mileage ?? 0),
      m.marketing_consent ? "동의" : "미동의",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members_${today().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showNotReady = (label: string) => {
    window.alert(`"${label}" 기능은 준비 중입니다.`);
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            회원 관리
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            가회원·정회원·매칭회원과 이용 상품을 한눈에 관리해요.
          </p>
        </div>
      </header>

      {/* 액션 툴바 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <ActionBtn active={!deleteMode} onClick={cancelDeleteMode}>회원 정보</ActionBtn>
        <ActionBtn
          active={deleteMode}
          onClick={deleteMode ? confirmDelete : enterDeleteMode}
          tone={deleteMode ? "danger" : undefined}
        >
          {deleteMode ? `삭제 (${selected.size})` : "회원 삭제"}
        </ActionBtn>
        {deleteMode && (
          <button
            onClick={cancelDeleteMode}
            className="px-3 py-1.5 rounded-full text-[12.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
          >
            취소
          </button>
        )}
        <ActionBtn onClick={() => showNotReady("미수 관리")}>미수 관리</ActionBtn>
        <ActionBtn onClick={() => showNotReady("취소/환불")}>취소/환불</ActionBtn>
        <ActionBtn onClick={() => showNotReady("단체 연장")}>단체 연장</ActionBtn>
        <ActionBtn onClick={() => showNotReady("정지 기록")}>정지 기록</ActionBtn>
        <ActionBtn onClick={() => showNotReady("수정 기록")}>수정 기록</ActionBtn>
      </div>

      {/* 통계 */}
      <div className="mb-4 grid grid-cols-3 gap-2 md:max-w-md">
        <StatCard label="전체 회원" value={totals.all} />
        <StatCard label="유효" value={totals.valid} tone="ok" />
        <StatCard label="만료" value={totals.expired} tone="warn" />
      </div>

      {/* 검색 */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 및 연락처로 검색"
        className={`${crmInputClass} mb-3`}
      />

      {/* 필터 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <FilterChip
          label="상태"
          value={fStatus}
          onChange={(v) => setFStatus(v as StatusFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "valid", label: "유효" },
            { value: "expired", label: "만료" },
          ]}
        />
        <div className="inline-flex items-center gap-1.5 flex-wrap">
          <FilterChip
            label="가입일"
            value={fSignup}
            onChange={(v) => setFSignup(v as SignupFilter)}
            options={[
              { value: "all", label: "전체" },
              { value: "this_week", label: "이번 주" },
              { value: "this_month", label: "이번 달" },
              { value: "this_year", label: "올해" },
              { value: "custom", label: "직접 선택" },
            ]}
          />
          {fSignup === "custom" && (
            <div className="inline-flex items-center gap-1">
              <input
                type="date"
                value={fSignupFrom}
                onChange={(e) => setFSignupFrom(e.target.value)}
                className="px-2 py-1 rounded-full text-[12px] border border-[#6B7B3A]/40 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 focus:outline-none focus:border-[#6B7B3A]"
              />
              <span className="text-[12px] text-[#A89B80]">~</span>
              <input
                type="date"
                value={fSignupTo}
                onChange={(e) => setFSignupTo(e.target.value)}
                className="px-2 py-1 rounded-full text-[12px] border border-[#6B7B3A]/40 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 focus:outline-none focus:border-[#6B7B3A]"
              />
            </div>
          )}
        </div>
        <FilterChip
          label="미방문 기간"
          value={fAbsence}
          onChange={(v) => setFAbsence(v as AbsenceFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "10d", label: "10일 이상" },
            { value: "20d", label: "20일 이상" },
            { value: "30d", label: "30일 이상" },
            { value: "60d", label: "60일 이상" },
            { value: "90d", label: "90일 이상" },
          ]}
        />
        <FilterChip
          label="최종 만료일"
          value={fExpire}
          onChange={(v) => setFExpire(v as ExpireFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "this_week", label: "이번 주" },
            { value: "this_month", label: "이번 달" },
            { value: "expired", label: "만료됨" },
          ]}
        />
        <FilterChip
          label="락커"
          value={fLocker}
          onChange={(v) => setFLocker(v as LockerFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "has", label: "보유" },
            { value: "none", label: "미보유" },
          ]}
        />
        <FilterChip
          label="운동 용품"
          value={fGoods}
          onChange={(v) => setFGoods(v as GoodsFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "has", label: "보유" },
            { value: "none", label: "미보유" },
          ]}
        />
      </div>

      <div className="mb-3 flex items-center justify-between text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
        <span>{filtered.length}명</span>
        <button onClick={resetFilters} className="hover:underline">
          초기화
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 표 / 빈 상태 */}
      {loading ? (
        <EmptyBox title="불러오는 중…" />
      ) : list.length === 0 ? (
        <EmptyBox
          title="데이터가 없어요"
          desc="아직 회원 정보를 등록하지 않았어요."
          action={
            <button
              onClick={() => setRegisterOpen(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
            >
              + 회원 추가
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyBox title="조건에 맞는 회원이 없어요" desc="필터를 초기화하거나 검색어를 바꿔 보세요." />
      ) : (
        <MembersTable
          rows={pageRows}
          deleteMode={deleteMode}
          selected={selected}
          onToggle={toggleSelect}
          onToggleAll={toggleSelectAllOnPage}
        />
      )}

      {/* 하단 액션 + 페이지네이션 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setRegisterOpen(true)}
          className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
        >
          + 회원 추가
        </button>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />

        <button
          onClick={downloadExcel}
          disabled={filtered.length === 0}
          className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          엑셀 다운로드
        </button>
      </div>

      <RegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={() => {
          setRegisterOpen(false);
          load();
        }}
      />
    </div>
  );
}

function ActionBtn({
  children,
  active,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base =
    "px-3 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors";
  if (active && tone === "danger") {
    return (
      <button onClick={onClick} className={`${base} border-red-500 bg-red-500 text-white hover:bg-red-600`}>
        {children}
      </button>
    );
  }
  if (active) {
    return (
      <button onClick={onClick} className={`${base} border-[#6B7B3A] bg-[#6B7B3A] text-white`}>
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const color =
    tone === "ok"
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : tone === "warn"
        ? "text-[#B47B2A] dark:text-amber-300"
        : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="px-3 py-2.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400">{label}</div>
      <div className={`text-[16px] font-bold mt-0.5 ${color}`}>{value}명</div>
    </div>
  );
}

function FilterChip({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const current = options.find((o) => o.value === value);
  const isAll = value === "all";
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[12px] text-[#6B5D47] dark:text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`py-1 pl-6 pr-6 rounded-full text-[12px] font-medium border whitespace-nowrap appearance-none text-center bg-[length:10px] bg-no-repeat bg-[right_8px_center]
          bg-[url("data:image/svg+xml;utf8,<svg fill='none' stroke='%236B5D47' stroke-width='2' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'><path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/></svg>")]
          ${isAll
            ? "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
            : "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
          }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {current && o.value === value ? o.label : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MembersTable({
  rows,
  deleteMode,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: MemberRow[];
  deleteMode: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}) {
  const todayStr = today().toISOString().slice(0, 10);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
      <table className="w-full text-[13px] min-w-[1100px]">
        <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
          <tr>
            {deleteMode && (
              <Th className="w-9 pl-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  className="w-4 h-4 accent-[#6B7B3A]"
                />
              </Th>
            )}
            <Th>이름</Th>
            <Th>회원 앱</Th>
            <Th>연락처</Th>
            <Th>가입일</Th>
            <Th>상태</Th>
            <Th>회원 유형</Th>
            <Th>최근 방문일</Th>
            <Th>이용 가능 상품</Th>
            <Th>최종 만료일</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const isValid = !!m.max_expires_at && m.max_expires_at >= todayStr;
            return (
              <tr
                key={m.id}
                className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#FBF7EB] dark:hover:bg-zinc-900/60"
              >
                {deleteMode && (
                  <Td className="pl-3">
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => onToggle(m.id)}
                      className="w-4 h-4 accent-[#6B7B3A]"
                    />
                  </Td>
                )}
                <Td>
                  <Link
                    href={`/crm/members/${m.id}`}
                    className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A] dark:hover:text-[#A8B87A]"
                  >
                    {m.name}
                  </Link>
                </Td>
                <Td>
                  {m.linked_firebase_uid ? (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]">
                      연동
                    </span>
                  ) : (
                    <span className="text-[#A89B80]">—</span>
                  )}
                </Td>
                <Td className="text-[#6B5D47] dark:text-zinc-400">
                  {m.phone ? formatPhone(m.phone) : "—"}
                </Td>
                <Td className="text-[#8C8270] dark:text-zinc-500">{formatDate(m.created_at)}</Td>
                <Td>
                  <StatusBadge isValid={isValid} hasAny={(m.items?.length ?? 0) > 0} />
                </Td>
                <Td className="text-[#6B5D47] dark:text-zinc-400">
                  {MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type}
                </Td>
                <Td className="text-[#8C8270] dark:text-zinc-500">
                  {m.last_visit_at ? formatDateTime(m.last_visit_at) : "—"}
                </Td>
                <Td>
                  {m.items && m.items.length > 0 ? (
                    <div className="space-y-1">
                      {m.items.map((it, idx) => (
                        <div key={idx} className="text-[12px] text-[#3A342A] dark:text-zinc-300">
                          <span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10.5px] font-semibold bg-[#F5E4C8]/70 dark:bg-amber-950/40 text-[#B47B2A] dark:text-amber-300">
                            {it.type === "membership" ? "회원권" : "수강권"}
                          </span>
                          <span className="font-medium">{it.kind}</span>
                          {it.remaining !== null && (
                            <span className="ml-1.5 text-[#8C8270]">잔여 {it.remaining}회</span>
                          )}
                          <span className="ml-1.5 text-[#A89B80]">~ {it.expires}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[#A89B80]">—</span>
                  )}
                </Td>
                <Td className="text-[#3A342A] dark:text-zinc-300">{m.max_expires_at ?? "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ isValid, hasAny }: { isValid: boolean; hasAny: boolean }) {
  if (!hasAny) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F5F0E5] dark:bg-zinc-800 text-[#A89B80]">
        미보유
      </span>
    );
  }
  if (isValid) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#6B7B3A]/15 text-[#6B7B3A] dark:text-[#A8B87A]">
        유효
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F5E4C8]/70 dark:bg-amber-950/40 text-[#B47B2A] dark:text-amber-300">
      만료
    </span>
  );
}

function EmptyBox({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-2xl">
      <div className="text-[14px] font-semibold text-[#3A342A] dark:text-zinc-300">{title}</div>
      {desc && <div className="mt-1.5 text-[12.5px] text-[#8C8270] dark:text-zinc-500">{desc}</div>}
      {action}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) {
    return <div className="text-[12px] text-[#A89B80]">1</div>;
  }
  const pages: number[] = [];
  const max = Math.min(totalPages, 7);
  for (let i = 1; i <= max; i += 1) pages.push(i);
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-2 py-1 rounded text-[12px] text-[#6B5D47] disabled:opacity-30"
      >
        ←
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`min-w-[24px] px-1.5 py-0.5 rounded text-[12px] font-medium
            ${page === p
              ? "bg-[#6B7B3A] text-white"
              : "text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
            }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-2 py-1 rounded text-[12px] text-[#6B5D47] disabled:opacity-30"
      >
        →
      </button>
    </div>
  );
}

function RegisterModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [memberType, setMemberType] = useState<"provisional" | "full" | "matched">("provisional");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birth, setBirth] = useState("1990-01-01");
  const [gender, setGender] = useState<"" | "M" | "F">("");
  const [linkedUid, setLinkedUid] = useState("");
  const [linkedNickname, setLinkedNickname] = useState("");
  const [nickQuery, setNickQuery] = useState("");
  const [nickResults, setNickResults] = useState<
    { firebase_uid: string; name: string; email: string | null }[]
  >([]);
  const [nickSearching, setNickSearching] = useState(false);
  const [nickSearched, setNickSearched] = useState(false);
  const [memo, setMemo] = useState("");
  const [address, setAddress] = useState("");
  const [visitRoute, setVisitRoute] = useState("");
  const [workoutGoal, setWorkoutGoal] = useState("");
  const [counselor, setCounselor] = useState("");
  const [mileage, setMileage] = useState("0");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setMemberType("provisional");
      setName("");
      setPhone("");
      setEmail("");
      setBirth("1990-01-01");
      setGender("");
      setLinkedUid("");
      setLinkedNickname("");
      setNickQuery("");
      setNickResults([]);
      setNickSearched(false);
      setMemo("");
      setAddress("");
      setVisitRoute("");
      setWorkoutGoal("");
      setCounselor("");
      setMileage("0");
      setMarketingConsent(false);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (memberType === "provisional") {
      setLinkedUid("");
      setLinkedNickname("");
      setNickQuery("");
      setNickResults([]);
      setNickSearched(false);
    }
  }, [memberType]);

  const searchNickname = async () => {
    const q = nickQuery.trim();
    setError("");
    if (!q) {
      setNickResults([]);
      setNickSearched(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      setNickSearching(true);
      const res = await fetch(`/api/crm/users/lookup?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "검색 실패");
      setNickResults(data.users ?? []);
      setNickSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setNickSearching(false);
    }
  };

  const pickUser = (u: { firebase_uid: string; name: string; email: string | null }) => {
    setLinkedUid(u.firebase_uid);
    setLinkedNickname(u.name);
    if (!name.trim()) setName(u.name);
    if (!email.trim() && u.email) setEmail(u.email);
    setNickResults([]);
    setNickSearched(false);
    setNickQuery("");
  };

  const clearLinked = () => {
    setLinkedUid("");
    setLinkedNickname("");
    setName("");
    setPhone("");
    setEmail("");
    setBirth("1990-01-01");
    setGender("");
    setMemo("");
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("이름을 입력해주세요");
    if (!phone.trim()) return setError("연락처를 입력해주세요");
    if ((memberType === "matched" || memberType === "full") && !linkedUid.trim()) {
      return setError("모두의 지도사 사용자를 닉네임으로 검색해 선택해 주세요");
    }
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/members", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_type: memberType,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          birth: birth || undefined,
          gender: gender || undefined,
          linked_firebase_uid: linkedUid.trim() || undefined,
          memo: memo.trim() || undefined,
          address: address.trim() || undefined,
          visit_route: visitRoute.trim() || undefined,
          workout_goal: workoutGoal.trim() || undefined,
          counselor: counselor.trim() || undefined,
          mileage: Number(mileage) || 0,
          marketing_consent: marketingConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "등록 실패");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원 등록">
      <div className="space-y-3">
        <CrmField label="회원 유형" required>
          <div className="grid grid-cols-3 gap-2">
            {(["provisional", "full", "matched"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMemberType(t)}
                className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors
                  ${memberType === t
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {MEMBER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
            {memberType === "provisional" && "이름·연락처만으로 미리 등록. 나중에 회원이 가입하면 매칭으로 전환할 수 있어요."}
            {memberType === "full" && "관리자가 가입을 대행해요. 사용자 식별자(uid)가 필요해요."}
            {memberType === "matched" && "이미 모두의 지도사를 사용하는 분과 매칭. uid가 필요해요."}
          </p>
        </CrmField>

        <CrmField label="이름" required>
          <input className={crmInputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </CrmField>
        <CrmField label="연락처" required>
          <input
            className={crmInputClass}
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-1234-5678"
          />
        </CrmField>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="성별">
            <select
              className={crmInputClass}
              value={gender}
              onChange={(e) => setGender(e.target.value as "" | "M" | "F")}
            >
              <option value="">선택 안 함</option>
              <option value="M">남</option>
              <option value="F">여</option>
            </select>
          </CrmField>
          <CrmField label="생년월일">
            <input
              type="date"
              className={crmInputClass}
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </CrmField>
        </div>
        <CrmField label="이메일">
          <input
            className={crmInputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </CrmField>

        {(memberType === "matched" || memberType === "full") && (
          <CrmField label="모두의 지도사 사용자 연결" required>
            {linkedUid ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/15">
                <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                  연결됨: <strong className="font-semibold">{linkedNickname}</strong>
                </span>
                <button
                  onClick={clearLinked}
                  className="text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
                >
                  다시 선택
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    className={`${crmInputClass} flex-1`}
                    value={nickQuery}
                    onChange={(e) => setNickQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchNickname();
                      }
                    }}
                    placeholder="닉네임 또는 이메일"
                  />
                  <button
                    type="button"
                    onClick={searchNickname}
                    disabled={nickSearching || !nickQuery.trim()}
                    className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
                  >
                    {nickSearching ? "검색 중…" : "검색"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
                  닉네임은 일부만 입력해도 검색되고, 이메일은 정확히 입력하면 바로 찾을 수 있어요.
                </p>
                {nickSearched && nickResults.length === 0 && (
                  <div className="mt-2 px-3 py-2 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                    일치하는 사용자가 없습니다.
                  </div>
                )}
                {nickResults.length > 0 && (
                  <ul className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
                    {nickResults.map((u) => (
                      <li key={u.firebase_uid}>
                        <button
                          type="button"
                          onClick={() => pickUser(u)}
                          className="w-full text-left px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50"
                        >
                          <div className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">
                            {u.name}
                          </div>
                          {u.email && (
                            <div className="text-[11.5px] text-[#A89B80] truncate">
                              {u.email}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CrmField>
        )}
        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[72px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>
        <CrmField label="주소">
          <input className={crmInputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
        </CrmField>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="방문 경로">
            <input className={crmInputClass} value={visitRoute} onChange={(e) => setVisitRoute(e.target.value)} />
          </CrmField>
          <CrmField label="운동 목적">
            <input className={crmInputClass} value={workoutGoal} onChange={(e) => setWorkoutGoal(e.target.value)} />
          </CrmField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="상담 담당자">
            <input className={crmInputClass} value={counselor} onChange={(e) => setCounselor(e.target.value)} />
          </CrmField>
          <CrmField label="마일리지">
            <input
              type="text"
              inputMode="numeric"
              className={crmInputClass}
              value={mileage}
              onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ""))}
            />
          </CrmField>
        </div>
        <CrmField label="광고성 수신 동의">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              마케팅·광고성 정보 수신에 동의
            </span>
          </label>
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] transition-colors mt-2"
        >
          {submitting ? "등록 중…" : "등록"}
        </button>
      </div>
    </CrmModal>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2.5 ${className || ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top ${className || ""}`}>{children}</td>;
}
function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${ymd} ${hm}`;
  } catch {
    return iso;
  }
}
