"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../_components/crm-modal";
import { formatWon, parseWon } from "../../_components/crm-labels";

type BillingMode = "period" | "count";
type DurationUnit = "day" | "month" | "year";

export interface ProductInitial {
  id?: number;
  type: string;
  billing_mode: BillingMode;
  category: string | null;
  name: string;
  description: string | null;
  open_time?: string | null;
  close_time?: string | null;
  operating_days?: number[];
  duration_value?: number | null;
  duration_unit?: string | null;
  service_days?: number | null;
  total_sessions?: number | null;
  pause_enabled?: boolean;
  pause_days?: number;
  pause_count?: number;
  price_won: number;
  vat_included?: boolean;
  mileage_earn?: number;
  mileage_usable?: boolean;
  attendance_mileage_earn?: number;
  capacity?: number;
  session_minutes?: number;
  daily_check_in_limit?: number;
  daily_time_limit_enabled?: boolean;
  components?: BundleComponent[];
}

export interface BundleComponent {
  type: string;
  billing_mode: BillingMode;
  duration_value?: number;
  total_sessions?: number;
  session_minutes?: number;
}

interface TypeOption {
  value: string;
  label: string;
  custom?: boolean;
  id?: number;
}

const BUILT_IN_TYPES: TypeOption[] = [
  { value: "membership", label: "회원권" },
  { value: "group", label: "그룹 수업" },
  { value: "personal", label: "개인 레슨" },
  { value: "locker", label: "락커" },
  { value: "apparel", label: "운동복" },
  { value: "goods", label: "운동 용품" },
];

const BUILT_IN_KEYS = new Set(["membership", "group", "personal", "locker", "apparel", "goods"]);

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "month", label: "개월" },
  { value: "day", label: "일" },
  { value: "year", label: "년" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DESC_MAX = 1000;

interface Props {
  mode: "create" | "edit";
  /** edit 모드에서 사용. create 모드 시 부분 초기값(예: 유형 프리셋)만 넘겨도 됨 */
  initial?: Partial<ProductInitial>;
  onSaved: () => void;
  onCancel: () => void;
  /** 'personal' 이면 강사 개인 상품 스코프로 저장 (수강권=personal/group 만 허용) */
  scope?: "center" | "personal";
}

/**
 * 상품 생성/수정 공용 폼.
 * new/page.tsx 와 상품 관리 페이지의 수정 모달 둘 다 사용.
 */
export function ProductForm({ mode, initial, onSaved, onCancel, scope = "center" }: Props) {
  const { getIdToken } = useAuth();

  const [customTypes, setCustomTypes] = useState<TypeOption[]>([]);
  const [type, setType] = useState<string>(initial?.type || "membership");
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [addTypeError, setAddTypeError] = useState("");

  // 기본 유형은 오버라이드 라벨 적용, 나머지는 순수 커스텀만 뒤에 추가
  // scope='personal' 이면 수강권 유형(개인/그룹)만 노출 — 커스텀 유형 제외.
  const typeOptions: TypeOption[] = useMemo(() => {
    const overrides = new Map(
      customTypes.filter((t) => BUILT_IN_KEYS.has(t.value)).map((t) => [t.value, t.label])
    );
    if (scope === "personal") {
      return BUILT_IN_TYPES.filter((bi) => bi.value === "personal" || bi.value === "group").map(
        (bi) => ({ ...bi, label: overrides.get(bi.value) ?? bi.label })
      );
    }
    const builtIn = BUILT_IN_TYPES.map((bi) => ({
      ...bi,
      label: overrides.get(bi.value) ?? bi.label,
    }));
    const purely = customTypes.filter((t) => !BUILT_IN_KEYS.has(t.value));
    return [...builtIn, ...purely];
  }, [customTypes, scope]);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/product-types", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setCustomTypes(
          (data.types ?? []).map((t: { id: number; key: string; label: string }) => ({
            value: t.key,
            label: t.label,
            custom: true,
            id: t.id,
          }))
        );
      }
    })();
  }, [getIdToken]);

  const addCustomType = async () => {
    setAddTypeError("");
    const label = newTypeLabel.trim();
    if (!label) return setAddTypeError("유형 이름을 입력해 주세요");
    setAddingType(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/product-types", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      const t: TypeOption = {
        value: data.type.key,
        label: data.type.label,
        custom: true,
        id: data.type.id,
      };
      setCustomTypes((prev) => [...prev, t]);
      setType(t.value);
      setNewTypeLabel("");
      setShowAddType(false);
    } catch (e) {
      setAddTypeError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAddingType(false);
    }
  };

  const removeCustomType = async (id: number) => {
    if (!window.confirm("이 유형을 목록에서 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/product-types/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data?.error || "삭제 실패");
      return;
    }
    setCustomTypes((prev) => prev.filter((t) => t.id !== id));
    if (customTypes.find((t) => t.id === id)?.value === type) {
      setType("membership");
    }
  };

  const [billingMode, setBillingMode] = useState<BillingMode>(
    initial?.billing_mode ?? "period"
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [openTime, setOpenTime] = useState(initial?.open_time ?? "00:00");
  const [closeTime, setCloseTime] = useState(initial?.close_time ?? "23:59");
  const [days, setDays] = useState<number[]>(
    initial?.operating_days ?? [0, 1, 2, 3, 4, 5, 6]
  );
  const [durationValue, setDurationValue] = useState(initial?.duration_value ?? 3);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    (initial?.duration_unit as DurationUnit) ?? "month"
  );
  const [serviceDays, setServiceDays] = useState(initial?.service_days ?? 0);
  const [totalSessions, setTotalSessions] = useState(initial?.total_sessions ?? 10);
  const [pauseEnabled, setPauseEnabled] = useState(initial?.pause_enabled ?? false);
  const [pauseDays, setPauseDays] = useState(initial?.pause_days ?? 0);
  const [pauseCount, setPauseCount] = useState(initial?.pause_count ?? 0);
  const [mileageEarn, setMileageEarn] = useState(initial?.mileage_earn ?? 0);
  const [mileageUsable, setMileageUsable] = useState(initial?.mileage_usable ?? true);
  const [attendanceMileageEarn, setAttendanceMileageEarn] = useState(
    initial?.attendance_mileage_earn ?? 0
  );
  // 출석 시 마일리지 적립 on/off (금액 > 0 이면 켜진 상태로 초기화)
  const [attendanceMileageEnabled, setAttendanceMileageEnabled] = useState(
    (initial?.attendance_mileage_earn ?? 0) > 0
  );
  const [priceText, setPriceText] = useState(
    initial?.price_won ? String(initial.price_won) : ""
  );
  const [vatIncluded, setVatIncluded] = useState(initial?.vat_included ?? false);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 2);
  const [sessionMinutes, setSessionMinutes] = useState(initial?.session_minutes ?? 50);
  const [dailyCheckInLimit, setDailyCheckInLimit] = useState(initial?.daily_check_in_limit ?? 1);
  const [dailyTimeLimitEnabled, setDailyTimeLimitEnabled] = useState(
    initial?.daily_time_limit_enabled ?? false
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [components, setComponents] = useState<BundleComponent[]>(initial?.components ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addComponent = () =>
    setComponents((prev) => [
      ...prev,
      { type: "personal", billing_mode: "count", total_sessions: 10, duration_value: 0, session_minutes: 50 },
    ]);
  const updateComponent = (i: number, patch: Partial<BundleComponent>) =>
    setComponents((prev) => prev.map((c, x) => (x === i ? { ...c, ...patch } : c)));
  const removeComponent = (i: number) =>
    setComponents((prev) => prev.filter((_, x) => x !== i));

  const priceWon = useMemo(() => parseWon(priceText), [priceText]);

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };
  const setAllDays = () => setDays([0, 1, 2, 3, 4, 5, 6]);
  const setWeekdays = () => setDays([1, 2, 3, 4, 5]);

  const save = async () => {
    setError("");
    if (!name.trim()) return setError("상품명을 입력해 주세요");
    if (billingMode === "period" && durationValue !== null && durationValue < 0)
      return setError("기간을 0 이상으로 입력해 주세요");
    if (billingMode === "count" && totalSessions !== null && totalSessions <= 0)
      return setError("총 횟수를 1 이상으로 입력해 주세요");
    if (priceWon < 0) return setError("금액을 확인해 주세요");
    if (type === "group" && capacity !== null && capacity <= 0)
      return setError("그룹 수업 정원을 1명 이상으로 입력해 주세요");
    if ((type === "personal" || type === "group") && sessionMinutes !== null && sessionMinutes <= 0)
      return setError("수업 시간을 1분 이상으로 입력해 주세요");

    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");

      const payload = {
        type,
        billing_mode: billingMode,
        name: name.trim(),
        description: description?.trim() || null,
        open_time: openTime,
        close_time: closeTime,
        operating_days: days,
        duration_value: billingMode === "period" ? durationValue ?? 0 : 0,
        duration_unit: durationUnit,
        service_days: serviceDays ?? 0,
        total_sessions: billingMode === "count" ? totalSessions ?? 0 : 0,
        pause_enabled: pauseEnabled,
        pause_days: pauseEnabled ? pauseDays ?? 0 : 0,
        pause_count: pauseEnabled ? pauseCount ?? 0 : 0,
        mileage_earn: mileageEarn ?? 0,
        mileage_usable: mileageUsable,
        attendance_mileage_earn: attendanceMileageEnabled ? attendanceMileageEarn ?? 0 : 0,
        price_won: priceWon,
        vat_included: vatIncluded,
        capacity: type === "group" ? capacity ?? 0 : 0,
        session_minutes:
          type === "personal" || type === "group" ? sessionMinutes ?? 0 : 0,
        daily_check_in_limit: Math.max(1, dailyCheckInLimit ?? 1),
        daily_time_limit_enabled: dailyTimeLimitEnabled,
        components: components.map((c) => ({
          type: c.type,
          billing_mode: c.billing_mode,
          duration_value: c.billing_mode === "period" ? c.duration_value ?? 0 : 0,
          total_sessions: c.billing_mode === "count" ? c.total_sessions ?? 0 : 0,
          session_minutes: c.type === "personal" || c.type === "group" ? c.session_minutes ?? 0 : 0,
        })),
        // create 모드에서만 scope 를 서버로 전송 (edit 는 소유가 이미 정해져 있음)
        ...(mode === "create" && scope === "personal" ? { scope: "personal" } : {}),
      };

      const url =
        mode === "edit" && initial?.id
          ? `/api/crm/products/${initial.id}`
          : "/api/crm/products";
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setSaving(false);
    }
  };

  return (
    <div>
      {/* 상품 유형 */}
      <Section title="상품 유형" required>
        <div className="flex flex-wrap gap-1.5 items-center">
          {typeOptions.map((opt) => (
            <span key={opt.value} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => setType(opt.value)}
                className={`px-3.5 py-1.5 text-[13px] font-medium border whitespace-nowrap
                  ${opt.custom ? "rounded-l-full" : "rounded-full"}
                  ${type === opt.value
                    ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                  }`}
              >
                {opt.label}
              </button>
              {opt.custom && opt.id !== undefined && (
                <button
                  type="button"
                  onClick={() => removeCustomType(opt.id!)}
                  title="이 유형 삭제"
                  className={`px-2 py-1.5 rounded-r-full text-[13px] border border-l-0 whitespace-nowrap
                    ${type === opt.value
                      ? "border-[#6B7B3A] bg-[#6B7B3A] text-white hover:bg-[#5a6932]"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#A89B80] hover:text-red-600"
                    }`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {scope === "personal" ? null : !showAddType ? (
            <button
              type="button"
              onClick={() => {
                setShowAddType(true);
                setAddTypeError("");
              }}
              className="px-3 py-1.5 rounded-full text-[13px] font-medium border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
            >
              + 유형 추가
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value.slice(0, 20))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomType();
                  }
                  if (e.key === "Escape") {
                    setShowAddType(false);
                    setNewTypeLabel("");
                  }
                }}
                placeholder="예: 사우나"
                maxLength={20}
                className="px-3 py-1.5 rounded-full text-[13px] border border-[#6B7B3A] bg-white dark:bg-zinc-900 text-[#2A251D] dark:text-zinc-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomType}
                disabled={addingType || !newTypeLabel.trim()}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold bg-[#6B7B3A] text-white disabled:opacity-60 hover:bg-[#5a6932]"
              >
                {addingType ? "…" : "확인"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddType(false);
                  setNewTypeLabel("");
                }}
                className="px-2 py-1.5 rounded-full text-[13px] text-[#6B5D47] hover:text-[#3A342A]"
              >
                취소
              </button>
            </span>
          )}
        </div>
        {addTypeError && (
          <div className="mt-2 px-2.5 py-1.5 rounded text-[12px] text-red-700 bg-red-50">
            {addTypeError}
          </div>
        )}
      </Section>

      {/* 이용 방식 */}
      <Section title="이용 방식" required>
        <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
          {(["count", "period"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setBillingMode(m)}
              className={`px-4 py-2 text-[13px] font-medium
                ${billingMode === m
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                }`}
            >
              {m === "period" ? "기간제" : "횟수제"}
            </button>
          ))}
        </div>
      </Section>

      {/* 그룹 수업 정원 */}
      {type === "group" && (
        <Section title="그룹 정원" required>
          <FieldLabel>한 클래스 최대 인원</FieldLabel>
          <div className="relative">
            <input
              type="number"
              min={1}
              value={capacity ?? 0}
              onChange={(e) => setCapacity(Math.max(0, Number(e.target.value) || 0))}
              className={`${crmInputClass} pr-9`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              명
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[2, 5, 8, 10, 12, 15, 20].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCapacity(n)}
                className={`px-2.5 py-1 rounded-full text-[12px] font-medium border whitespace-nowrap
                  ${capacity === n
                    ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {n}명
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* 기본 정보 */}
      <Section title="기본 정보">
        <FieldLabel>상품명</FieldLabel>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 3개월 헬스 회원권"
          className={crmInputClass}
          maxLength={60}
        />

        {/* 하루 출석 가능 횟수 (기본 1) */}
        <div className="mt-3">
          <FieldLabel>하루 출석 가능 횟수</FieldLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDailyCheckInLimit(n)}
                className={`px-2.5 py-1 rounded-full text-[12px] font-medium border
                  ${dailyCheckInLimit === n
                    ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {n}회
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={99}
              value={dailyCheckInLimit}
              onChange={(e) =>
                setDailyCheckInLimit(Math.max(1, Math.min(99, Number(e.target.value) || 1)))
              }
              className="w-16 px-2 py-1 rounded-full text-[12px] border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 bg-white dark:bg-zinc-900 text-center focus:outline-none ml-1"
              aria-label="하루 출석 가능 횟수 직접 입력"
            />
            <span className="text-[11.5px] text-[#A89B80]">회</span>
          </div>
        </div>

        {/* 하루 이용 가능 시간 (체크박스로 활성화) */}
        <div className="mt-3">
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dailyTimeLimitEnabled}
              onChange={(e) => setDailyTimeLimitEnabled(e.target.checked)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[13px] font-medium text-[#3A342A] dark:text-zinc-300">
              하루 이용 가능 시간 제한
            </span>
            {!dailyTimeLimitEnabled && (
              <span className="text-[11.5px] text-[#A89B80]">(체크 시 시간대 지정)</span>
            )}
          </label>
          {dailyTimeLimitEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>시작 시간</FieldLabel>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className={crmInputClass}
                />
              </div>
              <div>
                <FieldLabel>종료 시간</FieldLabel>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className={crmInputClass}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel>운영 요일</FieldLabel>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={setAllDays}
                className="text-[11.5px] px-2 py-0.5 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
              >
                매일
              </button>
              <button
                type="button"
                onClick={setWeekdays}
                className="text-[11.5px] px-2 py-0.5 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
              >
                평일
              </button>
            </div>
          </div>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`w-9 h-9 rounded-lg text-[12.5px] font-semibold border
                  ${days.includes(idx)
                    ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }
                  ${idx === 0 ? "text-red-500" : ""}
                  ${idx === 6 ? "text-blue-500" : ""}
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* 기간·횟수 설정 */}
      <Section title={billingMode === "period" ? "기간 설정" : "횟수 설정"}>
        {billingMode === "period" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>기간</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={durationValue ?? 0}
                  onChange={(e) => setDurationValue(Math.max(0, Number(e.target.value) || 0))}
                  className={crmInputClass}
                />
                <select
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                  className={`${crmInputClass} max-w-[88px]`}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel>서비스 기간 (일)</FieldLabel>
              <input
                type="number"
                min={0}
                value={serviceDays ?? 0}
                onChange={(e) => setServiceDays(Math.max(0, Number(e.target.value) || 0))}
                className={crmInputClass}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>총 횟수</FieldLabel>
              <input
                type="number"
                min={0}
                value={totalSessions ?? 0}
                onChange={(e) => setTotalSessions(Math.max(0, Number(e.target.value) || 0))}
                className={crmInputClass}
              />
            </div>
            <div>
              <FieldLabel>유효 기간 (일)</FieldLabel>
              <input
                type="number"
                min={1}
                disabled={serviceDays === 0}
                value={serviceDays === 0 ? "" : serviceDays ?? 0}
                onChange={(e) => setServiceDays(Math.max(0, Number(e.target.value) || 0))}
                className={`${crmInputClass} disabled:opacity-50`}
                placeholder={serviceDays === 0 ? "무기한" : undefined}
              />
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={serviceDays === 0}
                  onChange={(e) => setServiceDays(e.target.checked ? 0 : 30)}
                  className="w-4 h-4 accent-[#6B7B3A]"
                />
                <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">무기한</span>
              </label>
            </div>
          </div>
        )}

        {(type === "personal" || type === "group") && (
          <div className="mt-3">
            <FieldLabel>수업 시간 (분)</FieldLabel>
            <div className="relative">
              <input
                type="number"
                min={1}
                value={sessionMinutes ?? 0}
                onChange={(e) => setSessionMinutes(Math.max(0, Number(e.target.value) || 0))}
                className={`${crmInputClass} pr-9`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
                분
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[30, 45, 50, 60, 75, 90].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSessionMinutes(n)}
                  className={`px-2.5 py-1 rounded-full text-[12px] font-medium border whitespace-nowrap
                    ${sessionMinutes === n
                      ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                >
                  {n}분
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 정지 · 금액 */}
      <Section title="정지 · 금액 설정">
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={pauseEnabled}
            onChange={(e) => setPauseEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-300">
            정지(휴회) 허용
          </span>
        </label>
        {pauseEnabled && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>최대 정지 기간 (일)</FieldLabel>
              <input
                type="number"
                min={0}
                value={pauseDays ?? 0}
                onChange={(e) => setPauseDays(Math.max(0, Number(e.target.value) || 0))}
                className={crmInputClass}
              />
            </div>
            <div>
              <FieldLabel>정지 가능 횟수</FieldLabel>
              <input
                type="number"
                min={0}
                value={pauseCount ?? 0}
                onChange={(e) => setPauseCount(Math.max(0, Number(e.target.value) || 0))}
                className={crmInputClass}
                placeholder="0 = 제한 없음"
              />
            </div>
          </div>
        )}

        <FieldLabel>금액</FieldLabel>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={priceText ? formatWon(priceText) : ""}
            onChange={(e) => setPriceText(e.target.value)}
            placeholder="0"
            className={`${crmInputClass} pr-9`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            원
          </span>
        </div>
        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={vatIncluded}
            onChange={(e) => setVatIncluded(e.target.checked)}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
            부가세 포함 금액
          </span>
        </label>
      </Section>

      {/* 마일리지 */}
      <Section title="마일리지 설정">
        <FieldLabel>구매 시 적립 마일리지 (P)</FieldLabel>
        <div className="relative">
          <input
            type="number"
            min={0}
            value={mileageEarn ?? 0}
            onChange={(e) => setMileageEarn(Math.max(0, Number(e.target.value) || 0))}
            placeholder="0"
            className={`${crmInputClass} pr-9`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            P
          </span>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={attendanceMileageEnabled}
              onChange={(e) => {
                setAttendanceMileageEnabled(e.target.checked);
                if (!e.target.checked) setAttendanceMileageEarn(0);
              }}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-200">
              출석 시 마일리지 적립
            </span>
          </label>
          {attendanceMileageEnabled && (
            <div className="mt-2">
              <FieldLabel>출석 시 적립 마일리지 (P)</FieldLabel>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={attendanceMileageEarn ?? 0}
                  onChange={(e) =>
                    setAttendanceMileageEarn(Math.max(0, Number(e.target.value) || 0))
                  }
                  placeholder="0"
                  className={`${crmInputClass} pr-9`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
                  P
                </span>
              </div>
              <p className="mt-1.5 text-[11.5px] text-[#A89B80] dark:text-zinc-500">
                이 이용권 회원이 출석(체크인)할 때마다 적립돼요. <b>하루 1회</b>만 적립되며,
                하루에 여러 번 방문해도 중복 적립되지 않습니다.
              </p>
            </div>
          )}
        </div>

        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={mileageUsable}
            onChange={(e) => setMileageUsable(e.target.checked)}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
            이 상품 구매 시 마일리지 사용 허용
          </span>
        </label>
      </Section>

      {/* 상품 설명 */}
      <Section title="상품 설명">
        <textarea
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
          placeholder="회원에게 보여줄 안내 문구를 입력해 주세요."
          rows={5}
          className={`${crmInputClass} resize-none`}
        />
        <div className="mt-1 text-right text-[11.5px] text-[#A89B80]">
          {(description ?? "").length} / {DESC_MAX}
        </div>
      </Section>

      {/* 묶음 구성 상품 — 여러 상품을 하나로 판매 (예: [피티]24회 + [헬스]100일) */}
      <Section title="묶음 구성 상품">
        <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mb-2 leading-relaxed">
          위 상품에 <b>함께 발급될 다른 상품</b>을 추가하면 하나의 묶음 상품으로 판매돼요.
          <br />예: 위를 <b>[헬스]100일</b>로 만들고 아래에 <b>[피티]24회</b>를 추가 → “[피티]24회 + [헬스]100일” 묶음.
        </p>
        {components.length > 0 && (
          <ul className="space-y-2 mb-2">
            {components.map((c, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/50 dark:bg-zinc-900/50"
              >
                <select
                  value={c.type}
                  onChange={(e) => updateComponent(i, { type: e.target.value })}
                  className="px-2 py-1.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
                >
                  {BUILT_IN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <select
                  value={c.billing_mode}
                  onChange={(e) => updateComponent(i, { billing_mode: e.target.value as BillingMode })}
                  className="px-2 py-1.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
                >
                  <option value="period">기간제</option>
                  <option value="count">횟수제</option>
                </select>
                {c.billing_mode === "period" ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={c.duration_value ?? 0}
                      onChange={(e) => updateComponent(i, { duration_value: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 px-2 py-1.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-right"
                    />
                    <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">일</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={c.total_sessions ?? 0}
                      onChange={(e) => updateComponent(i, { total_sessions: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 px-2 py-1.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-right"
                    />
                    <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">회</span>
                  </span>
                )}
                {(c.type === "personal" || c.type === "group") && (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={c.session_minutes ?? 0}
                      onChange={(e) => updateComponent(i, { session_minutes: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-16 px-2 py-1.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-right"
                    />
                    <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">분</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeComponent(i)}
                  className="ml-auto shrink-0 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addComponent}
          className="px-3.5 py-2 rounded-full text-[13px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
        >
          + 상품 추가하기
        </button>
      </Section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
        >
          {mode === "edit" ? "취소" : "돌아가기"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
        >
          {saving ? "저장 중…" : mode === "edit" ? "수정 저장" : "저장"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        {title}
        {required && <span className="text-[#B47B2A] ml-1">*</span>}
      </h2>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
      {children}
    </div>
  );
}
