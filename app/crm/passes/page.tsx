"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import {
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  formatPhone,
} from "../_components/crm-labels";
import { crmInputClass } from "../_components/crm-modal";
import { useColumnWidths, ResizableTh } from "../_components/use-column-widths";
import { PassDetailModal } from "./_components/pass-detail-modal";
import { PeriodSelect, inPeriod } from "../_components/period-filter";

const P_COLS = [
  { key: "member", label: "회원" },
  { key: "phone", label: "연락처" },
  { key: "lesson", label: "수강권" },
  { key: "remaining", label: "잔여" },
  { key: "price", label: "금액" },
  { key: "payment", label: "결제" },
  { key: "trainer", label: "강사" },
  { key: "purchased", label: "구매일" },
  { key: "start", label: "시작" },
  { key: "expires", label: "만료" },
  { key: "status", label: "상태" },
] as const;
type PColKey = (typeof P_COLS)[number]["key"];
const P_DEFAULT_WIDTHS: Record<PColKey, number> = {
  member: 170,
  phone: 130,
  lesson: 160,
  remaining: 72,
  price: 104,
  payment: 96,
  trainer: 110,
  purchased: 110,
  start: 110,
  expires: 110,
  status: 90,
};

interface PassRow {
  id: number;
  member_id: number;
  member_name: string;
  member_phone: string | null;
  member_face_thumb: string | null;
  trainer_member_id: number;
  co_trainer_ids: number[] | null;
  seller_member_id: number;
  issue_type: string;
  lesson_kind: string;
  total_sessions: number;
  remaining_sessions: number;
  session_minutes: number;
  price_won: number;
  payment_method: string;
  payment_method_custom: string | null;
  issued_at: string;
  start_date: string | null;
  expires_at: string;
  status: string;
}

interface StaffOption {
  id: number;
  display_name: string;
  role: string;
  status: string;
}

// 발급 시 상품명 뒤에 붙는 "(N회)" 세션 수 표기는 목록에선 떼고 상품 이름만 표시.
// (예: "10회 이벤트(10회)" → "10회 이벤트", "기본 10회(신규)(10회)" → "기본 10회(신규)")
function passDisplayName(lessonKind: string): string {
  return (lessonKind || "").replace(/\s*\(\d+회\)\s*$/, "").trim() || lessonKind;
}

export default function CrmPassesPage() {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<PassRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [detailPassId, setDetailPassId] = useState<number | null>(null);
  const canEdit = !!perms["passes.edit"];

  const [issueOpen, setIssueOpen] = useState(false); // 수강권 발급(회원 선택 → 발급 창)
  // 필터
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [trainerFilter, setTrainerFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<string>("all"); // 발급 기간 (기본 전체)
  const [query, setQuery] = useState("");
  const { widths, startResize, reset, changed, totalWidth } = useColumnWidths<PColKey>(
    "crm_passes_col_widths_v1",
    P_DEFAULT_WIDTHS
  );

  const reqIdRef = useRef(0);
  const load = useCallback(async () => {
    const myReq = ++reqIdRef.current; // 최신 요청만 반영 (필터 빠르게 오갈 때 경쟁 방지)
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (trainerFilter) params.set("trainer_id", trainerFilter);
      if (paymentFilter) params.set("payment_method", paymentFilter);
      const res = await fetch(`/api/crm/passes?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (myReq !== reqIdRef.current) return; // 더 최신 요청이 있으면 이 결과는 버림
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.passes ?? []);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [getIdToken, statusFilter, trainerFilter, paymentFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStaff((data.staff ?? []).filter((s: StaffOption) => s.status === "active"));
      }
    })();
  }, [getIdToken]);

  // 권한 로드 (passes.edit)
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setPerms(data.permissions ?? {});
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken]);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s.display_name])), [staff]);
  // 발급 기간 필터 적용 (issued_at 기준)
  const periodList = useMemo(
    () => list.filter((p) => inPeriod(p.issued_at, periodFilter)),
    [list, periodFilter]
  );
  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return periodList;
    return periodList.filter((p) =>
      [p.member_name, p.member_phone, p.lesson_kind, staffMap.get(p.trainer_member_id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [periodList, query, staffMap]);

  // 컬럼 헤더 클릭 정렬 (회원 관리와 동일 UX). null = 서버 기본 순서.
  const [sortKey, setSortKey] = useState<PColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm_passes_sort_v1");
      if (saved) {
        const o = JSON.parse(saved) as { key: PColKey | null; dir: "asc" | "desc" };
        if (o && (o.dir === "asc" || o.dir === "desc")) {
          setSortKey(o.key ?? null);
          setSortDir(o.dir);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSort = (key: PColKey) => {
    setSortKey((prevKey) => {
      let nextKey: PColKey | null = key;
      let nextDir: "asc" | "desc";
      if (prevKey === key) {
        if (sortDir === "asc") nextDir = "desc";
        else {
          nextKey = null;
          nextDir = "asc";
        }
      } else {
        const desc = ["remaining", "price", "purchased", "start", "expires"].includes(key);
        nextDir = desc ? "desc" : "asc";
      }
      setSortDir(nextDir);
      try {
        localStorage.setItem("crm_passes_sort_v1", JSON.stringify({ key: nextKey, dir: nextDir }));
      } catch {
        /* ignore */
      }
      return nextKey;
    });
  };
  const sortVal = (p: PassRow, key: PColKey): string | number => {
    switch (key) {
      case "member": return (p.member_name || "").toLowerCase();
      case "phone": return p.member_phone || "";
      case "lesson": return (p.lesson_kind || "").toLowerCase();
      case "remaining": return p.remaining_sessions ?? 0;
      case "price": return p.price_won ?? 0;
      case "payment": return p.payment_method || "";
      case "trainer": return (staffMap.get(p.trainer_member_id) || "").toLowerCase();
      case "purchased": return p.issued_at || "";
      case "start": return p.start_date || "";
      case "expires": return p.expires_at || "";
      case "status": return p.status || "";
      default: return "";
    }
  };
  const visibleList = useMemo(() => {
    if (!sortKey) return filteredList;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredList].sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredList, sortKey, sortDir, staffMap]);
  const stats = useMemo(() => {
    const valid = periodList.filter((p) => p.status === "valid");
    const expiring = valid.filter((p) => daysUntil(p.expires_at) <= 7).length;
    return {
      total: periodList.length,
      valid: valid.length,
      remaining: valid.reduce((sum, p) => sum + (Number(p.remaining_sessions) || 0), 0),
      expiring,
      revenue: periodList.reduce((sum, p) => sum + (Number(p.price_won) || 0), 0),
    };
  }, [periodList]);
  const filtersActive = !!statusFilter || !!trainerFilter || !!paymentFilter || !!query.trim() || periodFilter !== "all";
  const resetFilters = () => {
    setStatusFilter("");
    setTrainerFilter("");
    setPaymentFilter("");
    setPeriodFilter("all");
    setQuery("");
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950/60 px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">
              LESSON PASS CONTROL
            </p>
            <h1 className="mt-1 text-[22px] md:text-[26px] font-bold text-[#241F18] dark:text-zinc-100">
              수강권 관리
            </h1>
            <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              발급된 레슨권의 잔여 세션, 만료일, 결제 상태를 한 화면에서 확인합니다.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <PeriodSelect value={periodFilter} onChange={setPeriodFilter} />
            <div className="rounded-lg border border-[#D9CDB8] bg-white/70 px-3 py-2 text-right dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">현재 결과</div>
              <div className="mt-0.5 text-[18px] font-bold text-[#2F3A2B] dark:text-[#A8B87A]">
                {visibleList.length.toLocaleString()}건
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          <MetricCard label="전체 수강권" value={`${stats.total.toLocaleString()}건`} hint="조회 결과 기준" />
          <MetricCard label="유효 수강권" value={`${stats.valid.toLocaleString()}건`} hint="사용 가능한 권한" tone="green" />
          <MetricCard label="잔여 세션" value={`${stats.remaining.toLocaleString()}회`} hint="유효권 잔여 합계" tone="blue" />
          <MetricCard label="7일 내 만료" value={`${stats.expiring.toLocaleString()}건`} hint="재등록 안내 대상" tone="gold" />
          <MetricCard label="수강권 매출" value={`${formatWon(stats.revenue)}원`} hint="현재 필터 합계" tone="dark" />
        </div>
      </header>

      <section className="mb-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "전체" },
              { value: "valid", label: "유효" },
              { value: "expired", label: "만료" },
              { value: "refunded", label: "환불" },
            ]}
          />
          <select
            className={`${crmInputClass} !w-auto min-w-[140px]`}
            value={trainerFilter}
            onChange={(e) => setTrainerFilter(e.target.value)}
          >
            <option value="">모든 강사</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setIssueOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-[#2F3A2B] text-white text-[13px] font-semibold hover:bg-[#243020] whitespace-nowrap shadow-sm dark:bg-[#A8B87A] dark:text-zinc-950"
          >
            + 수강권 발급
          </button>
          <select
            className={`${crmInputClass} !w-auto min-w-[150px]`}
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="">모든 결제 수단</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            className={`${crmInputClass} ml-auto max-w-[280px]`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="회원, 연락처, 수강권 검색"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              필터 초기화
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {changed && !loading && visibleList.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            열 너비 초기화
          </button>
        </div>
      )}

      {loading ? (
        <Msg>불러오는 중…</Msg>
      ) : visibleList.length === 0 ? (
        <Msg>일치하는 수강권이 없습니다.</Msg>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
          <table className="text-[13px] table-fixed" style={{ width: totalWidth }}>
            <colgroup>
              {P_COLS.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] }} />
              ))}
            </colgroup>
            <thead className="bg-[#F6F0E5] dark:bg-zinc-950/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                {P_COLS.map((c) => (
                  <ResizableTh
                    key={c.key}
                    colKey={c.key}
                    label={c.label}
                    onStart={startResize}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
              {visibleList.map((p) => (
                <tr
                  key={p.id}
                  className="bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#FAF5EA] dark:hover:bg-zinc-800/55 transition-colors"
                >
                  <Td>
                    <Link
                      href={`/crm/members/${p.member_id}`}
                      className="flex items-center gap-2 min-w-0 font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A] cursor-pointer"
                    >
                      {p.member_face_thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.member_face_thumb}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border border-[#E8E0D0] dark:border-zinc-700 shrink-0"
                        />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 shrink-0 flex items-center justify-center text-[10px] text-[#A89B80]">
                          —
                        </span>
                      )}
                      <span className="truncate">{p.member_name || "—"}</span>
                    </Link>
                  </Td>
                  <Td className="text-[#8C8270]">
                    {p.member_phone ? formatPhone(p.member_phone) : "—"}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setDetailPassId(p.id)}
                      title="수강권 상세 보기"
                      className="group text-left w-full cursor-pointer"
                    >
                      <div className="font-semibold text-[#2A251D] dark:text-zinc-100 truncate group-hover:text-[#6B7B3A] group-hover:underline">{passDisplayName(p.lesson_kind)}</div>
                    </button>
                  </Td>
                  <Td>
                    <SessionProgress remaining={p.remaining_sessions} total={p.total_sessions} />
                  </Td>
                  <Td className="font-semibold text-[#2A251D] dark:text-zinc-100">{formatWon(p.price_won)}원</Td>
                  <Td>
                    {p.payment_method === "etc" && p.payment_method_custom
                      ? p.payment_method_custom
                      : PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {(() => {
                      const primary = staffMap.get(p.trainer_member_id) ?? "—";
                      const extra = (p.co_trainer_ids ?? []).length;
                      return extra > 0 ? `${primary} 외 ${extra}명` : primary;
                    })()}
                  </Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">{p.issued_at}</Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">{p.start_date ?? "—"}</Td>
                  <Td>
                    <ExpiryCell expiresAt={p.expires_at} status={p.status} />
                  </Td>
                  <Td>
                    <StatusChip
                      status={p.status}
                      totalSessions={p.total_sessions}
                      remainingSessions={p.remaining_sessions}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailPassId !== null && (
        <PassDetailModal
          passId={detailPassId}
          staff={staff}
          canEdit={canEdit}
          onClose={() => setDetailPassId(null)}
          onSaved={load}
        />
      )}

      <PassIssueMemberPicker
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onPick={(memberId) => {
          setIssueOpen(false);
          router.push(`/crm/members/${memberId}?issue=pass`);
        }}
      />
    </div>
  );
}

/** 수강권 발급 — 회원을 먼저 선택하면 그 회원 상세로 이동해 발급 창이 자동으로 열린다. */
function PassIssueMemberPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (memberId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);

  const search = useCallback(async () => {
    const kw = q.trim();
    if (!kw) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/members?q=${encodeURIComponent(kw)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setResults((await res.json()).members ?? []);
    } finally {
      setLoading(false);
    }
  }, [q, getIdToken]);

  // 입력 디바운스 검색
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [q, open, search]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[10vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[#E4D9C6] bg-[#FEFCF7] p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">수강권 발급 — 회원 선택</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-[#8C8270] hover:bg-[#F5F0E5] dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            닫기
          </button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 연락처로 검색"
          className={crmInputClass}
        />
        <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-[#E8E0D0] dark:border-zinc-800 divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
          {loading ? (
            <div className="px-3 py-6 text-center text-[13px] text-[#8C8270]">검색 중…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-[#8C8270]">
              {q.trim() ? "검색 결과가 없어요." : "회원 이름·연락처를 입력해 주세요."}
            </div>
          ) : (
            results.map((m) => (
              <button
                key={m.id}
                onClick={() => onPick(m.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-[#FBF7EB] dark:hover:bg-zinc-900/60"
              >
                <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{m.name}</span>
                {m.phone && (
                  <span className="ml-2 text-[12px] text-[#A89B80] tabular-nums">{formatPhone(m.phone)}</span>
                )}
              </button>
            ))
          )}
        </div>
        <p className="mt-2 text-[11.5px] text-[#A89B80]">회원을 선택하면 상세 화면에서 수강권 발급 창이 열려요.</p>
      </div>
    </div>
  );
}

function StatusChip({
  status,
  totalSessions,
  remainingSessions,
}: {
  status: string;
  totalSessions?: number | null;
  remainingSessions?: number | null;
}) {
  // 횟수제 수강권이 모두 소진되면 날짜와 무관하게 '만료' 표시
  const exhausted =
    status === "valid" && (totalSessions ?? 0) > 0 && (remainingSessions ?? 0) <= 0;
  const eff = exhausted ? "expired" : status;
  const label = PASS_STATUS_LABEL[eff] ?? eff;
  const cls =
    eff === "valid"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : eff === "expired"
      ? "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "green",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "blue" | "gold" | "dark";
}) {
  const toneClass =
    tone === "blue"
      ? "text-[#315F7A] bg-[#EFF7F8] border-[#D7E7EA]"
      : tone === "gold"
      ? "text-[#826424] bg-[#FFF8E6] border-[#EAD9AA]"
      : tone === "dark"
      ? "text-[#2A251D] bg-[#F4F1EA] border-[#DDD3C2]"
      : "text-[#3E5D2D] bg-[#F3F7EA] border-[#DDE8C5]";

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClass} dark:bg-zinc-900 dark:border-zinc-800`}>
      <div className="text-[11px] font-semibold opacity-75">{label}</div>
      <div className="mt-1 text-[18px] font-bold tracking-normal whitespace-nowrap">{value}</div>
      <div className="mt-1 text-[11.5px] opacity-70 whitespace-nowrap">{hint}</div>
    </div>
  );
}

function SegmentedFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-[#D9CDB8] dark:border-zinc-700 bg-[#F7F2E8] dark:bg-zinc-950 p-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors ${
              active
                ? "bg-[#2F3A2B] text-white shadow-sm dark:bg-[#A8B87A] dark:text-zinc-950"
                : "text-[#6B5D47] hover:bg-white/80 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SessionProgress({ remaining, total }: { remaining: number; total: number }) {
  const safeTotal = Math.max(1, Number(total) || 0);
  const safeRemaining = Math.max(0, Number(remaining) || 0);
  const pct = Math.max(0, Math.min(100, (safeRemaining / safeTotal) * 100));
  const danger = safeRemaining <= 2 || pct <= 20;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-bold ${danger ? "text-red-600 dark:text-red-300" : "text-[#2F3A2B] dark:text-[#A8B87A]"}`}>
          {safeRemaining}회
        </span>
        <span className="text-[11px] text-[#A89B80]">/ {safeTotal}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[#ECE3D2] dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${danger ? "bg-red-500" : "bg-[#6B7B3A]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ExpiryCell({ expiresAt, status }: { expiresAt: string; status: string }) {
  const unlimited = expiresAt === "9999-12-31";
  const dDay = daysUntil(expiresAt);
  const urgent = !unlimited && status === "valid" && dDay <= 7;
  const label = status !== "valid" ? "종료" : dDay < 0 ? "만료" : dDay === 0 ? "오늘" : `D-${dDay}`;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[#8C8270] dark:text-zinc-500 truncate">{unlimited ? "무기한" : expiresAt}</span>
      {!unlimited && (
        <span
          className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold ${
            urgent
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "bg-[#F5F0E5] text-[#7A6B51] dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function daysUntil(ymd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T00:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-3 whitespace-nowrap overflow-hidden text-ellipsis ${className || ""}`}>
      {children}
    </td>
  );
}
function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
