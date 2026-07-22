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
        memberId={member.id}
        birth={member.birth ?? null}
        phone={member.phone}
        email={member.email}
        address={member.address}
        hasResident={!!member.has_resident}
        saving={saving}
        onSave={(p) => patchMember(p)}
      />

      <Section title="인사 정보">
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">근무형태</div>
          <select
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 disabled:opacity-60"
            value={member.employment_type ?? ""}
            disabled={saving}
            onChange={(e) => patchMember({ employment_type: e.target.value || null })}
          >
            <option value="">선택 안 함</option>
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </Section>

      <CommissionSection member={member} saving={saving} onSave={(p) => patchMember(p)} />

      <StaffContractsSection staffMemberId={member.id} />

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <DisplayNameSection
        currentName={member.display_name}
        saving={saving}
        onSave={(name) => patchMember({ display_name: name })}
      />

      <Section title="등급">
        <select
          className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A] disabled:opacity-60"
          value={member.grade_id ?? ""}
          disabled={saving || member.is_solo_owner}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            if (id) patchMember({ grade_id: id });
          }}
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
        <Section title="기능 권한 (강사·팀장)">
          <PermsGrid perms={perms} onToggle={patchPerms} disabled={saving} />
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
        </p>
      </Section>
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
  saving,
  onSave,
}: {
  member: StaffMember;
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
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

  const save = () => {
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
      onSave({ ...common, commission_type: "fixed", commission_rate: Number(rate) || 0 });
    } else {
      const parsed = tiers
        .filter((t) => t.rate.trim() !== "")
        .map((t) => ({
          upTo: t.upToMan.trim() === "" ? null : Math.round((Number(t.upToMan) || 0) * 10000),
          rate: Number(t.rate) || 0,
        }));
      onSave({ ...common, commission_type: "tiered", commission_tiers: parsed });
    }
  };

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

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 w-full px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
      >
        {saving ? "저장 중…" : "수업료 설정 저장"}
      </button>
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

function DisplayNameSection({
  currentName,
  saving,
  onSave,
}: {
  currentName: string;
  saving: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const changed = name.trim() !== currentName && name.trim().length > 0;

  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-1">
        센터 표시명
      </h2>
      <p className="text-[12px] text-[#A89B80] mb-3 leading-relaxed">
        센터 안에서만 보이는 이름이에요. 모두의 지도사 커뮤니티 닉네임은 그대로 유지돼요.
      </p>
      <div className="flex gap-2">
        <input
          className={`${crmInputClass} flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="실명을 입력해 주세요"
        />
        <button
          onClick={() => onSave(name.trim())}
          disabled={saving || !changed}
          className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-40 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}

function ContactSection({
  memberId,
  birth,
  phone,
  email,
  address,
  hasResident,
  saving,
  onSave,
}: {
  memberId: number;
  birth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hasResident: boolean;
  saving: boolean;
  onSave: (patch: { birth?: string | null; phone?: string | null; email?: string | null; address?: string | null; resident_no?: string }) => void;
}) {
  const { getIdToken } = useAuth();
  const [b, setB] = useState(birth ?? "");
  const [p, setP] = useState(formatPhone(phone ?? ""));
  const [e, setE] = useState(email ?? "");
  const [a, setA] = useState(address ?? "");
  const [residentFront, setResidentFront] = useState(""); // 앞 6자리
  const [residentBack, setResidentBack] = useState(""); // 뒤 7자리
  const [editingResident, setEditingResident] = useState(false);
  const residentBackRef = useRef<HTMLInputElement | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null); // 눈 아이콘 클릭 시 원본
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState("");

  useEffect(() => {
    setB(birth ?? "");
    setP(formatPhone(phone ?? ""));
    setE(email ?? "");
    setA(address ?? "");
  }, [birth, phone, email, address]);

  const dirtyBirth = b !== (birth ?? "");
  const dirtyPhone = p !== formatPhone(phone ?? "");
  const dirtyEmail = e !== (email ?? "");
  const dirtyAddress = a !== (address ?? "");
  const dirty = dirtyBirth || dirtyPhone || dirtyEmail || dirtyAddress;

  const save = () => {
    const patch: { birth?: string | null; phone?: string | null; email?: string | null; address?: string | null } = {};
    if (dirtyBirth) patch.birth = b.trim() || null;
    if (dirtyPhone) patch.phone = p.trim() || null;
    if (dirtyEmail) patch.email = e.trim() || null;
    if (dirtyAddress) patch.address = a.trim() || null;
    onSave(patch);
  };

  // 주민번호 별도 저장 (해시 저장이라 다른 필드와 함께 patch 안 함)
  const residentFrontDigits = residentFront.replace(/[^0-9]/g, "");
  const residentBackDigits = residentBack.replace(/[^0-9]/g, "");
  const residentReady = residentFrontDigits.length === 6 && residentBackDigits.length === 7;
  const saveResident = () => {
    if (!residentReady) return;
    onSave({ resident_no: residentFrontDigits + residentBackDigits });
    setResidentFront("");
    setResidentBack("");
    setEditingResident(false);
  };

  // 등록된 주민번호 마스킹 표시: 생년월일(YYMMDD)-*******
  const maskedResident = (() => {
    if (!hasResident) return null;
    const d = (birth ?? "").replace(/[^0-9]/g, "");
    const yymmdd = d.length >= 8 ? d.slice(2, 8) : d.slice(0, 6);
    return `${yymmdd || "******"}-*******`;
  })();

  // birth 또는 hasResident 바뀌면 노출 상태 초기화 (다른 직원 페이지로 이동 등)
  useEffect(() => {
    setRevealed(null);
    setRevealError("");
  }, [memberId, hasResident]);

  // 눈 아이콘 클릭 → 서버에 복호화 요청 → 원본 표시
  // 원본이 저장 안 돼 있으면(404) 자동으로 편집 모드로 전환
  const revealResident = async () => {
    if (revealed) {
      setRevealed(null);
      setRevealError("");
      return;
    }
    setRevealLoading(true);
    setRevealError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없어요");
      const res = await fetch(`/api/crm/staff/${memberId}/resident`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.status === 404) {
        // 암호화 원본 미저장 → 재입력 모드로 자동 전환
        setEditingResident(true);
        setRevealError("이전에 저장된 주민번호는 해시만 남아 원본을 복구할 수 없어요. 아래에 다시 입력해 주세요.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      const digits = String(data.resident_no || "").replace(/[^0-9]/g, "");
      if (digits.length !== 13) throw new Error("응답 형식 오류");
      setRevealed(`${digits.slice(0, 6)}-${digits.slice(6)}`);
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setRevealLoading(false);
    }
  };

  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        생년월일 / 연락처 / 이메일 / 주소
      </h2>
      <div className="space-y-3">
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">생년월일</div>
          <input
            type="date"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A] max-w-[220px]"
            value={b}
            onChange={(ev) => setB(ev.target.value)}
          />
        </div>

        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">
            주민등록번호 <span className="text-[#A89B80]">(선택 · 본인 확인용)</span>
          </div>
            {maskedResident && !editingResident ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5] dark:bg-zinc-800 text-[14px] font-medium text-[#3A342A] dark:text-zinc-200 tabular-nums">
                    {revealed ?? maskedResident}
                  </span>
                  <button
                    type="button"
                    onClick={revealResident}
                    disabled={revealLoading}
                    title={revealed ? "숨기기" : "주민번호 원본 보기 (본인·대표자만 · 조회 기록 남습니다)"}
                    aria-label={revealed ? "주민번호 숨기기" : "주민번호 보기"}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {revealLoading ? (
                      <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                    ) : revealed ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5" aria-hidden>
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.06 20.06 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.13 20.13 0 0 1-3.17 4.19M1 1l22 22" />
                        <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5" aria-hidden>
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingResident(true)}
                    className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                  >
                    변경
                  </button>
                </div>
                {revealError && (
                  <div className="text-[11.5px] text-red-600">{revealError}</div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-[120px] px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 tracking-wider tabular-nums focus:outline-none focus:border-[#6B7B3A]"
                  value={residentFront}
                  onChange={(ev) => {
                    const v = ev.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                    setResidentFront(v);
                    if (v.length === 6) residentBackRef.current?.focus();
                  }}
                  placeholder="YYMMDD"
                  maxLength={6}
                  aria-label="주민번호 앞 6자리"
                />
                <span className="text-[16px] font-semibold text-[#A89B80]">-</span>
                <input
                  ref={residentBackRef}
                  type="text"
                  inputMode="numeric"
                  className="w-[130px] px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 tracking-wider tabular-nums focus:outline-none focus:border-[#6B7B3A]"
                  value={residentBack}
                  onChange={(ev) => setResidentBack(ev.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                  placeholder="0000000"
                  maxLength={7}
                  aria-label="주민번호 뒤 7자리"
                />
                <button
                  type="button"
                  onClick={saveResident}
                  disabled={saving || !residentReady}
                  className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
                >
                  저장
                </button>
                {maskedResident && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingResident(false);
                      setResidentFront("");
                      setResidentBack("");
                    }}
                    className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#6B5D47] dark:text-zinc-300"
                  >
                    취소
                  </button>
                )}
              </div>
            )}
          <p className="mt-1.5 text-[11px] text-[#A89B80]">
            저장하면 원본은 AES-256으로 암호화 저장되고, 눈 아이콘으로 확인할 수 있어요. 조회는 본인·대표자만 가능하며 감사 로그에 기록됩니다.
          </p>
        </div>
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">연락처</div>
          <input
            type="tel"
            inputMode="numeric"
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
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="w-full px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-40 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
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
      className="inline-flex items-center gap-1.5 pl-2 pr-3.5 py-2 rounded-full border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200 shadow-sm hover:border-[#6B7B3A]/60 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
    >
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#6B7B3A]/12 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A]">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </span>
      직원 목록으로
    </button>
  );
}
