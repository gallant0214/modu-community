"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { MEMBER_TYPE_LABEL, GENDER_LABEL, formatPhone } from "../_components/crm-labels";
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
  registered_at: string | null;
  registration_type: string | null;
  first_use_at: string | null;
  total_paid_won: number;
  final_expire_at: string | null;
  last_purchase_at: string | null;
  last_attended_at: string | null;
  attendance_no: string | null;
  current_membership: string | null;
  current_pass: string | null;
  current_rental: string | null;
  current_locker: string | null;
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

type SortKey =
  | "name"
  | "gender"
  | "app"
  | "phone"
  | "registered_at"
  | "registration_type"
  | "first_use_at"
  | "total_paid_won"
  | "last_purchase_at"
  | "attendance_no"
  | "created_at"
  | "status"
  | "member_type"
  | "last_visit_at"
  | "last_attended_at"
  | "max_expires_at";
type SortDir = "asc" | "desc";

type ColKey =
  | "name"
  | "gender"
  | "app"
  | "phone"
  | "registration_type"
  | "registered_at"
  | "first_use_at"
  | "created_at"
  | "status"
  | "member_type"
  | "items"
  | "max_expires_at"
  | "days_remaining"
  | "last_visit_at"
  | "last_attended_at"
  | "last_purchase_at"
  | "total_paid_won"
  | "attendance_no";

const DEFAULT_COL_ORDER: ColKey[] = [
  "name",
  "gender",
  "app",
  "phone",
  "registration_type",
  "registered_at",
  "first_use_at",
  "created_at",
  "status",
  "member_type",
  "items",
  "max_expires_at",
  "days_remaining",
  "last_visit_at",
  "last_attended_at",
  "last_purchase_at",
  "total_paid_won",
  "attendance_no",
];
const COL_ORDER_KEY = "crm_members_col_order_v2";

const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  name: 110,
  gender: 64,
  app: 72,
  phone: 132,
  registration_type: 96,
  registered_at: 108,
  first_use_at: 108,
  created_at: 108,
  status: 78,
  member_type: 92,
  items: 240,
  max_expires_at: 112,
  days_remaining: 96,
  last_visit_at: 140,
  last_attended_at: 112,
  last_purchase_at: 112,
  total_paid_won: 104,
  attendance_no: 84,
};
const COL_WIDTH_KEY = "crm_members_col_widths_v1";
const SORT_KEY_STORAGE = "crm_members_sort_v1";

const PAGE_SIZE = 25;

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysBetween = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / (24 * 3600 * 1000));

// 유효 만료일: 실제 수강권/회원권(max_expires_at) 우선, 없으면 POS 스냅샷(final_expire_at)
const effExpiry = (m: MemberRow): string | null => m.max_expires_at ?? m.final_expire_at ?? null;
// 보유 상품 여부: 실제 items 또는 POS 스냅샷 보유(멤버십/이용권/대여권)
const hasHoldings = (m: MemberRow): boolean =>
  (m.items?.length ?? 0) > 0 ||
  !!m.current_membership ||
  !!m.current_pass ||
  !!m.current_rental;

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

  // 정렬 (헤더 클릭, localStorage 저장)
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY_STORAGE);
      if (saved) {
        const obj = JSON.parse(saved) as { key: SortKey | null; dir: SortDir };
        if (obj && (obj.dir === "asc" || obj.dir === "desc")) {
          setSortKey(obj.key ?? null);
          setSortDir(obj.dir);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  const persistSort = (key: SortKey | null, dir: SortDir) => {
    try {
      localStorage.setItem(SORT_KEY_STORAGE, JSON.stringify({ key, dir }));
    } catch {
      /* ignore */
    }
  };
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      const nextDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(nextDir);
      persistSort(key, nextDir);
    } else {
      setSortKey(key);
      setSortDir("asc");
      persistSort(key, "asc");
    }
  };

  // 열 순서 (드래그로 변경, localStorage 저장)
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(DEFAULT_COL_ORDER);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COL_ORDER_KEY);
      if (saved) {
        const arr = JSON.parse(saved) as ColKey[];
        if (
          Array.isArray(arr) &&
          arr.length === DEFAULT_COL_ORDER.length &&
          DEFAULT_COL_ORDER.every((k) => arr.includes(k))
        ) {
          setColumnOrder(arr);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  const reorderColumns = (from: number, to: number) => {
    setColumnOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      try {
        localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const resetColumnOrder = () => {
    setColumnOrder(DEFAULT_COL_ORDER);
    try {
      localStorage.removeItem(COL_ORDER_KEY);
    } catch {
      /* ignore */
    }
  };
  const orderChanged =
    JSON.stringify(columnOrder) !== JSON.stringify(DEFAULT_COL_ORDER);

  // 열 너비 (드래그로 조절, localStorage 저장)
  const [columnWidths, setColumnWidths] = useState<Record<ColKey, number>>(DEFAULT_COL_WIDTHS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTH_KEY);
      if (saved) {
        const obj = JSON.parse(saved) as Record<string, number>;
        setColumnWidths({ ...DEFAULT_COL_WIDTHS, ...obj });
      }
    } catch {
      /* ignore */
    }
  }, []);
  const widthSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeColumn = useCallback((key: ColKey, width: number) => {
    setColumnWidths((prev) => {
      const next = { ...prev, [key]: width };
      if (widthSaveTimer.current) clearTimeout(widthSaveTimer.current);
      widthSaveTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }, 300);
      return next;
    });
  }, []);
  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COL_WIDTHS);
    try {
      localStorage.removeItem(COL_WIDTH_KEY);
    } catch {
      /* ignore */
    }
  };
  const widthsChanged = DEFAULT_COL_ORDER.some(
    (k) => columnWidths[k] !== DEFAULT_COL_WIDTHS[k]
  );

  // 액션 모드 (회원 삭제)
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/members?detail=1&limit=5000`, {
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
        const eff = effExpiry(m);
        const isValid = eff && eff >= todayStr;
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
        const eff = effExpiry(m);
        if (fExpire === "expired") {
          if (!eff || eff >= todayStr) return false;
        } else if (fExpire === "this_week") {
          if (!eff) return false;
          const d = new Date(eff);
          if (d < startOfWeek || d >= endOfWeek) return false;
        } else if (fExpire === "this_month") {
          if (!eff) return false;
          const d = new Date(eff);
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

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const todayStr = today().toISOString().slice(0, 10);
    const statusRank = (m: MemberRow) => {
      if (!hasHoldings(m)) return 0; // 미보유
      const eff = effExpiry(m);
      return eff && eff >= todayStr ? 2 : 1; // 유효 : 만료
    };
    const val = (m: MemberRow): string | number => {
      switch (sortKey) {
        case "name":
          return m.name || "";
        case "gender":
          return m.gender || "";
        case "app":
          return m.linked_firebase_uid ? 1 : 0;
        case "phone":
          return (m.phone || "").replace(/\D/g, "");
        case "registered_at":
          return m.registered_at || "";
        case "created_at":
          return m.created_at || "";
        case "status":
          return statusRank(m);
        case "member_type":
          return MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type;
        case "last_visit_at":
          return m.last_visit_at || m.last_attended_at || "";
        case "last_attended_at":
          return m.last_attended_at || "";
        case "max_expires_at":
          return effExpiry(m) || "";
        case "registration_type":
          return m.registration_type || "";
        case "first_use_at":
          return m.first_use_at || "";
        case "total_paid_won":
          return m.total_paid_won || 0;
        case "last_purchase_at":
          return m.last_purchase_at || "";
        case "attendance_no":
          return m.attendance_no || "";
        default:
          return "";
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      // 빈 값은 항상 뒤로
      const sa = String(va);
      const sb = String(vb);
      if (!sa && sb) return 1;
      if (sa && !sb) return -1;
      return sa.localeCompare(sb, "ko") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const todayStr = today().toISOString().slice(0, 10);
    let valid = 0;
    let expired = 0;
    for (const m of list) {
      const eff = effExpiry(m);
      if (eff && eff >= todayStr) valid += 1;
      else expired += 1;
    }
    return { all: list.length, valid, expired };
  }, [list]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, fStatus, fSignup, fSignupFrom, fSignupTo, fAbsence, fExpire, fLocker, fGoods, sortKey, sortDir]);

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
      "신규/재등록",
      "최근 등록일",
      "이용 시작일",
      "가입일",
      "상태",
      "회원 유형",
      "이용 가능 상품",
      "최종 만료일",
      "남은 일수",
      "최근 방문일",
      "마지막 출석일",
      "마지막 구매일",
      "누적 결제",
      "출석번호",
      "락커",
      "주소",
      "방문 경로",
      "운동 목적",
      "상담 담당자",
      "마일리지",
      "광고성 수신",
    ];
    const todayStr = today().toISOString().slice(0, 10);
    const rows = filtered.map((m) => {
      const eff = effExpiry(m);
      const holdings =
        m.items && m.items.length > 0
          ? m.items
              .map(
                (it) =>
                  `${it.type === "membership" ? "회원권" : "수강권"}|${it.kind}|${
                    it.remaining ?? ""
                  }|${it.expires}`
              )
              .join(";")
          : [
              m.current_membership && `회원권|${m.current_membership}`,
              m.current_pass && `이용권|${m.current_pass}`,
              m.current_rental && `대여권|${m.current_rental}`,
              m.current_locker && `락커|${m.current_locker}`,
            ]
              .filter(Boolean)
              .join(";");
      const daysLeft = eff ? daysBetween(new Date(eff), new Date(todayStr)) : null;
      return [
        m.name,
        m.linked_firebase_uid ? "연동" : "미연동",
        m.phone ? formatPhone(m.phone) : "",
        m.registration_type ?? "",
        m.registered_at ?? "",
        m.first_use_at ?? "",
        formatDate(m.created_at),
        eff && eff >= todayStr ? "유효" : hasHoldings(m) ? "만료" : "미보유",
        MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type,
        holdings,
        eff ?? "",
        daysLeft === null ? "" : daysLeft >= 0 ? `${daysLeft}일 남음` : `${-daysLeft}일 지남`,
        m.last_visit_at ? formatDateTime(m.last_visit_at) : m.last_attended_at ?? "",
        m.last_attended_at ?? "",
        m.last_purchase_at ?? "",
        m.total_paid_won > 0 ? String(m.total_paid_won) : "",
        m.attendance_no ?? "",
        m.locker_label ?? m.current_locker ?? "",
        m.address ?? "",
        m.visit_route ?? "",
        m.workout_goal ?? "",
        m.counselor ?? "",
        String(m.mileage ?? 0),
        m.marketing_consent ? "동의" : "미동의",
      ];
    });
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
        <span className="flex items-center gap-2">
          <span>{filtered.length}명</span>
          <span className="hidden md:inline text-[11.5px] text-[#A89B80]">
            · 헤더 클릭=정렬, ⠿ 드래그=순서, 오른쪽 끝 드래그=너비
          </span>
        </span>
        <span className="flex items-center gap-3">
          {(orderChanged || widthsChanged) && (
            <button
              onClick={() => {
                resetColumnOrder();
                resetColumnWidths();
              }}
              className="hover:underline text-[#6B7B3A] dark:text-[#A8B87A]"
            >
              열 초기화
            </button>
          )}
          <button onClick={resetFilters} className="hover:underline">
            초기화
          </button>
        </span>
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
          order={columnOrder}
          onReorder={reorderColumns}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          widths={columnWidths}
          onResize={resizeColumn}
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

interface ColDef {
  key: ColKey;
  label: string;
  sortKey: SortKey | null;
  render: (m: MemberRow, todayStr: string) => React.ReactNode;
}

const COLUMN_DEFS: Record<ColKey, ColDef> = {
  name: {
    key: "name",
    label: "이름",
    sortKey: "name",
    render: (m) => (
      <Link
        href={`/crm/members/${m.id}`}
        className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A] dark:hover:text-[#A8B87A]"
      >
        {m.name}
      </Link>
    ),
  },
  gender: {
    key: "gender",
    label: "성별",
    sortKey: "gender",
    render: (m) => (
      <span className="text-[#6B5D47] dark:text-zinc-400">
        {m.gender ? GENDER_LABEL[m.gender] ?? m.gender : "—"}
      </span>
    ),
  },
  app: {
    key: "app",
    label: "회원 앱",
    sortKey: "app",
    render: (m) =>
      m.linked_firebase_uid ? (
        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]">
          연동
        </span>
      ) : (
        <span className="text-[#A89B80]">—</span>
      ),
  },
  phone: {
    key: "phone",
    label: "연락처",
    sortKey: "phone",
    render: (m) => (
      <span className="text-[#6B5D47] dark:text-zinc-400">
        {m.phone ? formatPhone(m.phone) : "—"}
      </span>
    ),
  },
  registered_at: {
    key: "registered_at",
    label: "최근 등록일",
    sortKey: "registered_at",
    render: (m) => (
      <span className="text-[#8C8270] dark:text-zinc-500">{m.registered_at ?? "—"}</span>
    ),
  },
  created_at: {
    key: "created_at",
    label: "가입일",
    sortKey: "created_at",
    render: (m) => (
      <span className="text-[#8C8270] dark:text-zinc-500">{formatDate(m.created_at)}</span>
    ),
  },
  status: {
    key: "status",
    label: "상태",
    sortKey: "status",
    render: (m, todayStr) => {
      const eff = effExpiry(m);
      return <StatusBadge isValid={!!eff && eff >= todayStr} hasAny={hasHoldings(m)} />;
    },
  },
  member_type: {
    key: "member_type",
    label: "회원 유형",
    sortKey: "member_type",
    render: (m) => (
      <span className="text-[#6B5D47] dark:text-zinc-400">
        {MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type}
      </span>
    ),
  },
  registration_type: {
    key: "registration_type",
    label: "신규/재등록",
    sortKey: "registration_type",
    render: (m) =>
      m.registration_type ? (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
            m.registration_type === "재등록"
              ? "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
              : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#8C8270]"
          }`}
        >
          {m.registration_type}
        </span>
      ) : (
        <span className="text-[#A89B80]">—</span>
      ),
  },
  first_use_at: {
    key: "first_use_at",
    label: "이용 시작일",
    sortKey: "first_use_at",
    render: (m) => (
      <span className="text-[#8C8270] dark:text-zinc-500">{m.first_use_at ?? "—"}</span>
    ),
  },
  last_visit_at: {
    key: "last_visit_at",
    label: "최근 방문일",
    sortKey: "last_visit_at",
    render: (m) => (
      <span className="text-[#8C8270] dark:text-zinc-500">
        {m.last_visit_at ? formatDateTime(m.last_visit_at) : m.last_attended_at ?? "—"}
      </span>
    ),
  },
  last_attended_at: {
    key: "last_attended_at",
    label: "마지막 출석일",
    sortKey: "last_attended_at",
    render: (m) => (
      <span className="text-[#8C8270] dark:text-zinc-500">{m.last_attended_at ?? "—"}</span>
    ),
  },
  last_purchase_at: {
    key: "last_purchase_at",
    label: "마지막 구매일",
    sortKey: "last_purchase_at",
    render: (m) => (
      <span className="text-[#8C8270] dark:text-zinc-500">{m.last_purchase_at ?? "—"}</span>
    ),
  },
  total_paid_won: {
    key: "total_paid_won",
    label: "누적 결제",
    sortKey: "total_paid_won",
    render: (m) => (
      <span className="text-[#3A342A] dark:text-zinc-300">
        {m.total_paid_won > 0 ? `${m.total_paid_won.toLocaleString()}원` : "—"}
      </span>
    ),
  },
  attendance_no: {
    key: "attendance_no",
    label: "출석번호",
    sortKey: "attendance_no",
    render: (m) => (
      <span className="text-[#6B5D47] dark:text-zinc-400">{m.attendance_no ?? "—"}</span>
    ),
  },
  days_remaining: {
    key: "days_remaining",
    label: "남은 일수",
    sortKey: "max_expires_at",
    render: (m, todayStr) => {
      const eff = effExpiry(m);
      if (!eff) return <span className="text-[#A89B80]">—</span>;
      const days = daysBetween(new Date(eff), new Date(todayStr));
      return (
        <span className={days >= 0 ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#B47B2A] dark:text-amber-300"}>
          {days >= 0 ? `${days}일 남음` : `${-days}일 지남`}
        </span>
      );
    },
  },
  items: {
    key: "items",
    label: "이용 가능 상품",
    sortKey: null,
    render: (m) => {
      if (m.items && m.items.length > 0) {
        return (
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
        );
      }
      // POS 스냅샷 보유 상품 (실제 수강권/회원권 미임포트 회원)
      const snaps: { tag: string; label: string }[] = [];
      if (m.current_membership) snaps.push({ tag: "회원권", label: m.current_membership });
      if (m.current_pass) snaps.push({ tag: "이용권", label: m.current_pass });
      if (m.current_rental) snaps.push({ tag: "대여권", label: m.current_rental });
      if (m.current_locker) snaps.push({ tag: "락커", label: m.current_locker });
      if (snaps.length === 0) return <span className="text-[#A89B80]">—</span>;
      return (
        <div className="space-y-1">
          {snaps.map((s, idx) => (
            <div key={idx} className="text-[12px] text-[#3A342A] dark:text-zinc-300">
              <span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10.5px] font-semibold bg-[#EFE7D5] dark:bg-zinc-800 text-[#8C7B4A] dark:text-zinc-400">
                {s.tag}
              </span>
              <span className="font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      );
    },
  },
  max_expires_at: {
    key: "max_expires_at",
    label: "최종 만료일",
    sortKey: "max_expires_at",
    render: (m) => (
      <span className="text-[#3A342A] dark:text-zinc-300">{effExpiry(m) ?? "—"}</span>
    ),
  },
};

function MembersTable({
  rows,
  deleteMode,
  selected,
  onToggle,
  onToggleAll,
  order,
  onReorder,
  sortKey,
  sortDir,
  onSort,
  widths,
  onResize,
}: {
  rows: MemberRow[];
  deleteMode: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  order: ColKey[];
  onReorder: (from: number, to: number) => void;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  widths: Record<ColKey, number>;
  onResize: (key: ColKey, width: number) => void;
}) {
  const todayStr = today().toISOString().slice(0, 10);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // 열 너비 드래그
  const resizing = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      onResize(r.key, Math.max(56, r.startW + (e.clientX - r.startX)));
    };
    const onUp = () => {
      resizing.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onResize]);

  const cols = order.map((k) => COLUMN_DEFS[k]);
  const totalWidth =
    (deleteMode ? 36 : 0) + cols.reduce((sum, c) => sum + (widths[c.key] ?? 120), 0);

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
      <table className="text-[13px] table-fixed" style={{ width: totalWidth }}>
        <colgroup>
          {deleteMode && <col style={{ width: 36 }} />}
          {cols.map((c) => (
            <col key={c.key} style={{ width: widths[c.key] ?? 120 }} />
          ))}
        </colgroup>
        <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
          <tr>
            {deleteMode && (
              <Th className="pl-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  className="w-4 h-4 accent-[#6B7B3A]"
                />
              </Th>
            )}
            {cols.map((c, idx) => {
              const active = sortKey === c.sortKey && c.sortKey !== null;
              return (
                <th
                  key={c.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overIdx !== idx) setOverIdx(idx);
                  }}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) onReorder(dragIdx, idx);
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  className={`relative text-left font-medium px-3 py-2.5 whitespace-nowrap select-none overflow-hidden
                    ${overIdx === idx && dragIdx !== null ? "bg-[#6B7B3A]/10" : ""}
                    ${dragIdx === idx ? "opacity-40" : ""}`}
                >
                  <span className="inline-flex items-center gap-1 max-w-full">
                    <span
                      draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragEnd={() => {
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      className="text-[#C9BEA6] dark:text-zinc-600 text-[10px] cursor-move"
                      title="드래그해서 열 순서 변경"
                    >
                      ⠿
                    </span>
                    {c.sortKey ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.sortKey!)}
                        className={`inline-flex items-center gap-0.5 hover:text-[#6B7B3A] truncate ${
                          active ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold" : ""
                        }`}
                      >
                        {c.label}
                        <span className="text-[9px] leading-none shrink-0">
                          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      <span className="truncate">{c.label}</span>
                    )}
                  </span>
                  {/* 오른쪽 끝: 너비 조절 핸들 */}
                  <span
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      resizing.current = {
                        key: c.key,
                        startX: e.clientX,
                        startW: widths[c.key] ?? 120,
                      };
                      document.body.style.cursor = "col-resize";
                    }}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#6B7B3A]/30"
                    title="드래그해서 열 너비 조절"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
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
              {cols.map((c) => (
                <Td key={c.key} className="overflow-hidden">
                  {c.render(m, todayStr)}
                </Td>
              ))}
            </tr>
          ))}
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
  const [registeredAt, setRegisteredAt] = useState(() => new Date().toISOString().slice(0, 10));
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
      setRegisteredAt(new Date().toISOString().slice(0, 10));
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
          registered_at: registeredAt || undefined,
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
        <CrmField label="최근 등록일">
          <input
            type="date"
            className={crmInputClass}
            value={registeredAt}
            onChange={(e) => setRegisteredAt(e.target.value)}
          />
        </CrmField>
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
