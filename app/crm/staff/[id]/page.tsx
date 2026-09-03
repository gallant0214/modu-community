"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import {
  ROLE_LABEL,
  ATTENDANCE_MODE_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  formatPhone,
} from "../../_components/crm-labels";
import { crmInputClass } from "../../_components/crm-modal";
import { StaffContractsSection } from "./_staff-contracts";

interface StaffMember {
  id: number;
  firebase_uid: string;
  role: string;
  grade_id: number | null;
  display_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  employment_status: string;
  employment_type: string | null;
  access_level: string;
  is_solo_owner: boolean;
  status: string;
  joined_at: string;
  left_at: string | null;
  commission_type: string;
  commission_rate: number;
  commission_tiers: { upTo: number | null; rate: number }[];
  base_salary: number;
  cash_pay_enabled?: boolean;
  cash_pay_won?: number;
  commission_bonuses?: {
    metric: string;
    gte: number;
    reward_type?: string;
    bonus_won?: number;
    bonus_percent?: number;
  }[];
  birth?: string | null;
  has_resident?: boolean;
}

interface Grade {
  id: number;
  base_role: string;
  label: string;
  is_system: boolean;
}

interface Permissions {
  center_member_id: number;
  can_create_reservation: boolean;
  can_modify_reservation: boolean;
  can_cancel_reservation: boolean;
  attendance_mode: string;
  can_cancel_attendance: boolean;
  can_issue_pass: boolean;
  can_manage_all_schedules: boolean;
}

export default function CrmStaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = Number(params.id);
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<StaffMember | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // 하단 단일 저장: 각 폼 섹션이 '현재 값 payload' 를 반환하는 collector 를 등록 →
  // saveAll 에서 모두 병합해 한 번에 PATCH.
  const collectorsRef = useRef<Record<string, () => Record<string, unknown>>>({});
  const registerCollector = useCallback(
    (key: string, fn: () => Record<string, unknown>) => {
      collectorsRef.current[key] = fn;
    },
    []
  );
  const [employmentType, setEmploymentType] = useState<string>("");
  const [gradeId, setGradeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/staff/${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMember(data.member);
      setPerms(data.permissions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  useEffect(() => {
    if (memberId) load();
  }, [memberId, load]);

  // member 로드/갱신 시 단일저장용 로컬 상태(근무형태·등급) 동기화
  useEffect(() => {
    if (member) {
      setEmploymentType(member.employment_type ?? "");
      setGradeId(member.grade_id ?? null);
    }
  }, [member]);

  // 등급 목록 1회 로드
  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/grades", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGrades(data.grades ?? []);
      }
    })();
  }, [getIdToken]);

  const patchMember = async (body: Record<string, unknown>) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/staff/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const patchPerms = async (body: Record<string, unknown>) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/staff/${memberId}/permissions`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  // 하단 단일 저장 — 등록된 모든 섹션 payload + 근무형태·등급을 병합해 한 번에 저장
  const saveAll = async () => {
    if (!member || saving) return;
    const merged: Record<string, unknown> = {};
    for (const fn of Object.values(collectorsRef.current)) {
      try {
        Object.assign(merged, fn());
      } catch {
        /* 개별 섹션 payload 생성 실패는 건너뜀 */
      }
    }
    // 관리 필드(근무형태·등급)는 '변경됐을 때만' 전송 → 권한 없는 편집자가 연락처만
    // 수정해도 관리필드 동봉으로 전체가 403 되는 것을 방지.
    if (!member.is_solo_owner) {
      if ((employmentType || null) !== (member.employment_type ?? null)) {
        merged.employment_type = employmentType || null;
      }
      if (gradeId !== (member.grade_id ?? null)) {
        merged.grade_id = gradeId;
      }
    }
    await patchMember(merged);
  };

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-6">
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      </div>
    );
  }
  if (!member) {
    return (
      <div className="px-5 md:px-8 py-6">
        <BackLink />
        <div className="mt-4 text-[14px] text-[#6B5D47]">
          {error || "직원을 찾을 수 없습니다."}
        </div>
      </div>
    );
  }

  const isTrainerLike = member.role === "trainer" || member.role === "manager";
  const isSelfNotOwner = member.is_solo_owner;

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <BackLink />

      <header className="mt-3 mb-5">
        <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          {member.display_name}
          {isSelfNotOwner && (
            <span className="ml-2 text-[12px] text-[#A89B80]">· 본인</span>
          )}
        </h1>
      </header>

      <ContactSection
        name={member.display_name}
        birth={member.birth ?? null}
        phone={member.phone}
        email={member.email}
        address={member.address}
        register={registerCollector}
      />

      {/* 개인 강사(solo) 본인 프로필에서는 급여·계약·등급·권한·재직 등 센터 관리 섹션 숨김 (개인 CRM 불필요) */}
      {!member.is_solo_owner && (
        <>
      <Section title="인사 정보">
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">근무형태</div>
          <select
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 disabled:opacity-60"
            value={employmentType}
            disabled={saving}
            onChange={(e) => setEmploymentType(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </Section>

      <CommissionSection member={member} register={registerCollector} />

      <StaffContractsSection staffMemberId={member.id} />

      <Section title="등급">
        <select
          className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A] disabled:opacity-60"
          value={gradeId ?? ""}
          disabled={saving || member.is_solo_owner}
          onChange={(e) => setGradeId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">선택해 주세요</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label} {g.is_system ? "" : "· 커스텀"}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[12px] text-[#A89B80] leading-relaxed">
          현재 등급:{" "}
          <strong className="text-[#3A342A] dark:text-zinc-200">
            {grades.find((g) => g.id === member.grade_id)?.label ?? ROLE_LABEL[member.role] ?? member.role}
          </strong>
          {" "}(권한 분류: {ROLE_LABEL[member.role] ?? member.role}).{" "}
          새 등급을 만들려면 설정 → 등급 관리에서 추가하세요.
        </p>
        {member.is_solo_owner && (
          <p className="mt-1 text-[12px] text-[#A89B80]">
            본인(개인 강사) 등급은 변경할 수 없어요.
          </p>
        )}
      </Section>

      {isTrainerLike && (
        <Section title="기능 권한">
          <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
            예약 생성·변경·취소, 출석 확정·취소, 수강권 발급, 타 강사 스케줄 관리 등 기능 권한은
            이제 <strong>센터설정 → 직급 권한</strong>에서 <strong>등급별로</strong> 설정합니다.
            (개인별 권한 토글은 직급 권한으로 통합되었습니다.)
          </p>
        </Section>
      )}

      <Section title="재직 상태">
        <div className="flex gap-2">
          <SegBtn
            selected={member.status === "active" && member.employment_status !== "on_leave"}
            disabled={saving || member.is_solo_owner}
            onClick={() => patchMember({ employment_status: "working", status: "active" })}
          >
            재직
          </SegBtn>
          <SegBtn
            selected={member.status === "active" && member.employment_status === "on_leave"}
            disabled={saving || member.is_solo_owner}
            onClick={() => patchMember({ employment_status: "on_leave", status: "active" })}
          >
            휴직
          </SegBtn>
          <SegBtn
            selected={member.status === "inactive"}
            disabled={saving || member.is_solo_owner}
            onClick={() => {
              if (confirm("이 직원을 퇴사 처리할까요? CRM 접근이 차단됩니다.")) {
                patchMember({ employment_status: "resigned", status: "inactive" }).then(() => {
                  if (typeof window !== "undefined" && window.history.length > 1) router.back();
                  else router.push("/crm/settings?tab=staff");
                });
              }
            }}
            danger
          >
            퇴사 처리
          </SegBtn>
        </div>
        <p className="mt-2 text-[12px] text-[#A89B80] leading-relaxed">
          휴직: CRM 접근은 유지되고 재직 목록에 남아요. 퇴사 처리: CRM 접근이 차단돼요.
          {" "}(재직/휴직/퇴사는 누르는 즉시 적용돼요.)
        </p>
      </Section>
        </>
      )}

      {error && (
        <div className="mt-2 mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 하단 단일 저장 — 위에서 작성한 내용(연락처·인사·수업료·등급)을 한 번에 저장 */}
      <button
        onClick={saveAll}
        disabled={saving}
        className="mt-2 w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14px] font-bold hover:bg-[#5a6932] transition-colors"
      >
        {saving ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}

function PermsGrid({
  perms,
  onToggle,
  disabled,
}: {
  perms: Permissions | null;
  onToggle: (body: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const items: { key: keyof Permissions; label: string; hint?: string }[] = [
    { key: "can_create_reservation", label: "예약 생성" },
    { key: "can_modify_reservation", label: "예약 변경" },
    { key: "can_cancel_reservation", label: "예약 취소" },
    { key: "can_cancel_attendance", label: "출석 취소" },
    { key: "can_issue_pass", label: "수강권 발급" },
    {
      key: "can_manage_all_schedules",
      label: "타 강사 스케줄 관리",
      hint: "본인 외 강사의 예약·개인일정도 만들고 수정·삭제 가능",
    },
  ];
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <ToggleRow
          key={String(it.key)}
          label={it.label}
          hint={it.hint}
          on={!!perms?.[it.key]}
          disabled={disabled}
          onChange={(v) => onToggle({ [it.key]: v })}
        />
      ))}
      <div className="pt-2 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-2">
          출석 확인 권한
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["trainer", "owner_only"] as const).map((m) => (
            <SegBtn
              key={m}
              selected={perms?.attendance_mode === m}
              disabled={disabled}
              onClick={() => onToggle({ attendance_mode: m })}
            >
              {ATTENDANCE_MODE_LABEL[m]}
            </SegBtn>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ─── 수업료(정산) 설정 ────────────────────────────── */

interface TierInput {
  upToMan: string; // 만원 단위 (빈값 = 이상/상한 없음)
  rate: string; // %
}

function CommissionSection({
  member,
  register,
}: {
  member: StaffMember;
  register: (key: string, fn: () => Record<string, unknown>) => void;
}) {
  const [type, setType] = useState<"fixed" | "tiered">(
    member.commission_type === "tiered" ? "tiered" : "fixed"
  );
  const [rate, setRate] = useState(String(member.commission_rate ?? 0));
  const [baseSalary, setBaseSalary] = useState(String(member.base_salary ?? 0));
  const [hasBase, setHasBase] = useState((member.base_salary ?? 0) > 0);
  const [tiers, setTiers] = useState<TierInput[]>(() =>
    member.commission_tiers && member.commission_tiers.length > 0
      ? member.commission_tiers.map((t) => ({
          upToMan: t.upTo == null ? "" : String(Math.round(t.upTo / 10000)),
          rate: String(t.rate),
        }))
      : [
          { upToMan: "600", rate: "50" },
          { upToMan: "1000", rate: "60" },
          { upToMan: "", rate: "70" },
        ]
  );

  const setTier = (i: number, patch: Partial<TierInput>) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTier = () => setTiers((prev) => [...prev, { upToMan: "", rate: "" }]);
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i));

  // 현금 지급 (3.3% 원천징수 대상 아님)
  const [cashEnabled, setCashEnabled] = useState(!!member.cash_pay_enabled);
  const [cashWon, setCashWon] = useState(String(member.cash_pay_won ?? 0));

  // 커미션(성과급) 조건 — 달성 시 급여 가산 (정액 원 또는 수업료의 %)
  interface BonusInput {
    metric: "revenue" | "sessions";
    gte: string; // revenue=만원 / sessions=건
    rewardType: "won" | "percent";
    bonusWon: string; // 원
    bonusPercent: string; // 수업료 대비 %
  }
  const [bonuses, setBonuses] = useState<BonusInput[]>(() =>
    (member.commission_bonuses ?? []).map((b) => ({
      metric: b.metric === "sessions" ? "sessions" : "revenue",
      gte:
        b.metric === "sessions"
          ? String(b.gte)
          : String(Math.round((b.gte || 0) / 10000)),
      rewardType: b.reward_type === "percent" ? "percent" : "won",
      bonusWon: String(b.bonus_won ?? 0),
      bonusPercent: String(b.bonus_percent ?? 0),
    }))
  );
  const setBonus = (i: number, patch: Partial<BonusInput>) =>
    setBonuses((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addBonus = () =>
    setBonuses((prev) => [
      ...prev,
      { metric: "revenue", gte: "", rewardType: "won", bonusWon: "", bonusPercent: "" },
    ]);
  const removeBonus = (i: number) => setBonuses((prev) => prev.filter((_, idx) => idx !== i));

  // 하단 단일저장용 payload 생성기 등록 (항상 최신 값 반영)
  const buildPayload = (): Record<string, unknown> => {
    const base = hasBase ? Math.max(0, Number(baseSalary) || 0) : 0;
    const bonusPayload = bonuses
      .filter(
        (b) =>
          b.gte.trim() !== "" &&
          (b.rewardType === "percent" ? b.bonusPercent.trim() !== "" : b.bonusWon.trim() !== "")
      )
      .map((b) => ({
        metric: b.metric,
        gte:
          b.metric === "sessions"
            ? Math.max(0, Math.floor(Number(b.gte) || 0))
            : Math.round((Number(b.gte) || 0) * 10000),
        reward_type: b.rewardType,
        bonus_won: b.rewardType === "won" ? Math.max(0, Math.floor(Number(b.bonusWon) || 0)) : 0,
        bonus_percent:
          b.rewardType === "percent" ? Math.max(0, Math.min(1000, Number(b.bonusPercent) || 0)) : 0,
      }));
    const common = {
      base_salary: base,
      cash_pay_enabled: cashEnabled,
      cash_pay_won: cashEnabled ? Math.max(0, Number(cashWon) || 0) : 0,
      commission_bonuses: bonusPayload,
    };
    if (type === "fixed") {
      return { ...common, commission_type: "fixed", commission_rate: Number(rate) || 0 };
    }
    const parsed = tiers
      .filter((t) => t.rate.trim() !== "")
      .map((t) => ({
        upTo: t.upToMan.trim() === "" ? null : Math.round((Number(t.upToMan) || 0) * 10000),
        rate: Number(t.rate) || 0,
      }));
    return { ...common, commission_type: "tiered", commission_tiers: parsed };
  };
  const payloadRef = useRef(buildPayload);
  payloadRef.current = buildPayload;
  // 초기(로드시) 값 스냅샷 — 수업료 설정을 '건드렸을 때만' 전송(권한 게이트 회피)
  const baselineRef = useRef<string | null>(null);
  if (baselineRef.current === null) baselineRef.current = JSON.stringify(buildPayload());
  useEffect(() => {
    register("commission", () => {
      const cur = payloadRef.current();
      return JSON.stringify(cur) === baselineRef.current ? {} : cur;
    });
  }, [register]);

  return (
    <Section title="수업료(정산) 설정">
      {/* 고정 급여 유무 */}
      <div className="mb-4 pb-4 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={hasBase}
            onChange={(e) => setHasBase(e.target.checked)}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[13px] font-medium text-[#3A342A] dark:text-zinc-300">
            고정 급여 있음 (월)
          </span>
        </label>
        {hasBase && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={baseSalary ? Number(baseSalary).toLocaleString() : ""}
              onChange={(e) => setBaseSalary(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
              className={`${crmInputClass} max-w-[180px]`}
            />
            <span className="text-[14px] text-[#6B5D47] dark:text-zinc-400">원 / 월</span>
          </div>
        )}
        <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
          총 지급액 = 고정 급여 + 수업료(아래 비율 적용)
        </p>
      </div>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setType("fixed")}
          className={`px-3 py-2 rounded-lg text-[13px] font-medium border ${
            type === "fixed"
              ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
              : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
          }`}
        >
          고정 %
        </button>
        <button
          type="button"
          onClick={() => setType("tiered")}
          className={`px-3 py-2 rounded-lg text-[13px] font-medium border ${
            type === "tiered"
              ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
              : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
          }`}
        >
          매출 구간별 %
        </button>
      </div>

      {type === "fixed" ? (
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">건당 수업료 비율 (매출과 무관 고정)</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={`${crmInputClass} max-w-[120px]`}
            />
            <span className="text-[14px] text-[#6B5D47] dark:text-zinc-400">%</span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
            예: 50 → 강사 매출의 50% 지급
          </p>
        </div>
      ) : (
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-2">
            월 매출 구간에 따라 비율 적용 (해당 구간 비율을 전체 매출에 적용)
          </div>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={t.upToMan}
                  onChange={(e) => setTier(i, { upToMan: e.target.value })}
                  placeholder="이상(상한없음)"
                  className={`${crmInputClass} max-w-[130px]`}
                />
                <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                  만원까지
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.rate}
                  onChange={(e) => setTier(i, { rate: e.target.value })}
                  className={`${crmInputClass} max-w-[80px]`}
                />
                <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">%</span>
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="ml-auto shrink-0 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addTier}
            className="mt-2 text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
          >
            + 구간 추가
          </button>
          <p className="mt-2 text-[11.5px] text-[#A89B80] leading-relaxed">
            예: 600만원까지 50% · 1000만원까지 60% · (마지막 칸 비우면) 그 이상 70%
          </p>
        </div>
      )}

      {/* 커미션(성과급) 조건 — 달성 시 급여 가산 */}
      <div className="mt-4 pt-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-300 mb-1">
          커미션 (성과급)
        </div>
        <p className="text-[11.5px] text-[#A89B80] mb-2.5">
          조건을 달성하면 그 달 급여에 보너스가 더해져요. 정액(원) 또는 수업료의 % 중 선택.
          <br />
          예: 진행 세션 100건 이상 → 수업료 +10% · 월 매출 1,000만원 이상 → +30만원
        </p>
        <div className="space-y-2">
          {bonuses.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-wrap">
              <select
                value={b.metric}
                onChange={(e) => setBonus(i, { metric: e.target.value as "revenue" | "sessions" })}
                className={`${crmInputClass} max-w-[110px]`}
              >
                <option value="revenue">월 매출</option>
                <option value="sessions">진행 세션</option>
              </select>
              <input
                type="number"
                min={0}
                value={b.gte}
                onChange={(e) => setBonus(i, { gte: e.target.value })}
                placeholder="0"
                className={`${crmInputClass} max-w-[80px]`}
              />
              <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                {b.metric === "sessions" ? "건 이상 →" : "만원 이상 →"}
              </span>
              <select
                value={b.rewardType}
                onChange={(e) => setBonus(i, { rewardType: e.target.value as "won" | "percent" })}
                className={`${crmInputClass} max-w-[110px]`}
              >
                <option value="won">+ 정액(원)</option>
                <option value="percent">+ 수업료 %</option>
              </select>
              {b.rewardType === "percent" ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={b.bonusPercent}
                    onChange={(e) => setBonus(i, { bonusPercent: e.target.value })}
                    placeholder="0"
                    className={`${crmInputClass} max-w-[80px]`}
                  />
                  <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={b.bonusWon ? Number(b.bonusWon).toLocaleString() : ""}
                    onChange={(e) => setBonus(i, { bonusWon: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="0"
                    className={`${crmInputClass} max-w-[110px]`}
                  />
                  <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">원</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeBonus(i)}
                className="ml-auto shrink-0 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addBonus}
          className="mt-2.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[12.5px] font-semibold hover:bg-[#6B7B3A]/8"
        >
          + 커미션 조건 추가
        </button>
      </div>

      {/* 현금 지급 — 3.3% 원천징수 대상 아님 */}
      <div className="mt-4 pt-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={cashEnabled}
            onChange={(e) => setCashEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[13px] font-medium text-[#3A342A] dark:text-zinc-300">
            현금 지급 있음 (월)
          </span>
        </label>
        {cashEnabled && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={cashWon ? Number(cashWon).toLocaleString() : ""}
              onChange={(e) => setCashWon(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
              className={`${crmInputClass} max-w-[180px]`}
            />
            <span className="text-[14px] text-[#6B5D47] dark:text-zinc-400">원 / 월</span>
          </div>
        )}
        <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
          현금 지급액은 <strong>3.3% 원천징수 대상이 아니에요</strong>. 총 지급액에는 더해지고, 세금 계산에서는 제외됩니다.
        </p>
      </div>
    </Section>
  );
}

function SegBtn({
  selected,
  disabled,
  onClick,
  danger,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50
        ${selected
          ? danger
            ? "border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
            : "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A] dark:bg-[#6B7B3A]/20"
          : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
        }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between py-1.5 gap-3">
      <div className="min-w-0">
        <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-300">{label}</span>
        {hint && (
          <p className="mt-0.5 text-[11.5px] text-[#A89B80] dark:text-zinc-500 leading-tight">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        disabled={disabled}
        className={`shrink-0 relative inline-flex w-10 h-6 rounded-full transition-colors disabled:opacity-50 mt-0.5
          ${on ? "bg-[#6B7B3A]" : "bg-[#E8E0D0] dark:bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform
            ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

function ContactSection({
  name,
  birth,
  phone,
  email,
  address,
  register,
}: {
  name: string;
  birth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  register: (key: string, fn: () => Record<string, unknown>) => void;
}) {
  const [n, setN] = useState(name ?? "");
  const [b, setB] = useState(birth ?? "");
  const bMonthRef = useRef<HTMLInputElement>(null);
  const bDayRef = useRef<HTMLInputElement>(null);
  const [p, setP] = useState(formatPhone(phone ?? ""));
  const [e, setE] = useState(email ?? "");
  const [a, setA] = useState(address ?? "");

  useEffect(() => {
    setN(name ?? "");
    setB(birth ?? "");
    setP(formatPhone(phone ?? ""));
    setE(email ?? "");
    setA(address ?? "");
  }, [name, birth, phone, email, address]);

  // 하단 단일저장용 payload 생성기 등록 (항상 최신 값 반영)
  const buildPayload = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (n.trim()) patch.display_name = n.trim();
    // 완전한 날짜(YYYY-MM-DD)만 저장. 부분 입력이면 null(빈 값)로.
    patch.birth = /^\d{4}-\d{2}-\d{2}$/.test(b.trim()) ? b.trim() : null;
    patch.phone = p.trim() || null;
    patch.email = e.trim() || null;
    patch.address = a.trim() || null;
    return patch;
  };
  const payloadRef = useRef(buildPayload);
  payloadRef.current = buildPayload;
  useEffect(() => {
    register("contact", () => payloadRef.current());
  }, [register]);

  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        실명 / 생년월일 / 연락처 / 이메일 / 주소
      </h2>
      <div className="space-y-3">
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">생년월일</div>
          {(() => {
            const parts = (b || "").split("-");
            const yy = parts[0] ?? "";
            const mm = parts[1] ?? "";
            const dd = parts[2] ?? "";
            const compose = (y: string, m: string, d: string) =>
              !y ? "" : !m ? y : !d ? `${y}-${m}` : `${y}-${m}-${d}`;
            const cellCls =
              "px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-center tabular-nums text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]";
            return (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
                  value={yy}
                  onChange={(ev) => {
                    const y = ev.target.value.replace(/\D/g, "").slice(0, 4);
                    setB(compose(y, mm, dd));
                    if (y.length === 4) bMonthRef.current?.focus();
                  }}
                  className={`${cellCls} w-20`}
                />
                <span className="text-[13px] text-[#A89B80]">년</span>
                <input
                  ref={bMonthRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="MM"
                  value={mm}
                  onChange={(ev) => {
                    const m = ev.target.value.replace(/\D/g, "").slice(0, 2);
                    setB(compose(yy, m, dd));
                    if (m.length === 2) bDayRef.current?.focus();
                  }}
                  className={`${cellCls} w-14`}
                />
                <span className="text-[13px] text-[#A89B80]">월</span>
                <input
                  ref={bDayRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="DD"
                  value={dd}
                  onChange={(ev) => {
                    const d = ev.target.value.replace(/\D/g, "").slice(0, 2);
                    setB(compose(yy, mm, d));
                  }}
                  className={`${cellCls} w-14`}
                />
                <span className="text-[13px] text-[#A89B80]">일</span>
              </div>
            );
          })()}
        </div>

        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">
            실명 <span className="text-red-500">*</span>
          </div>
          <input
            type="text"
            required
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A] max-w-[220px]"
            value={n}
            onChange={(ev) => setN(ev.target.value)}
            placeholder="실명"
          />
        </div>

        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">
            연락처 <span className="text-red-500">*</span>
          </div>
          <input
            type="tel"
            inputMode="numeric"
            required
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
            value={p}
            onChange={(ev) => setP(formatPhone(ev.target.value))}
            placeholder="010-1234-5678"
          />
        </div>
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">이메일</div>
          <input
            type="email"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            placeholder="example@email.com"
          />
        </div>
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">주소</div>
          <input
            type="text"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
            value={a}
            onChange={(ev) => setA(ev.target.value)}
            placeholder="예: 강남구 강남대로 1길 1-11"
          />
        </div>
        {(!n.trim() || !p.trim()) && (
          <p className="text-[12px] text-red-600 dark:text-red-400">
            실명과 연락처는 필수 항목이에요. (하단 저장 버튼으로 저장)
          </p>
        )}
      </div>
    </section>
  );
}

function BackLink() {
  const router = useRouter();
  const goBack = () => {
    // 진짜 직전 페이지로 복귀 (센터설정 직원관리 탭 / 독립 목록 등 어디서 왔든)
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/crm/settings?tab=staff");
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className="group inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-semibold text-[#7A6B51] transition-colors hover:text-[#2F3A2B] dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center transition-transform group-hover:-translate-x-0.5">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </span>
      뒤로가기
    </button>
  );
}
