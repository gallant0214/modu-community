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
  /** 구성 상품명 (묶음 판매 시 이 이름으로 각 항목 발급) */
  name?: string;
  /** 구성 상품 개별 가격 (묶음 총액 = 상단 상품 + 각 구성 합산) */
  price_won?: number;
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
  { value: "locker", label: "락커" },
  { value: "apparel", label: "운동복" },
  { value: "personal", label: "개인 레슨" },
  { value: "group", label: "그룹 수업" },
  { value: "goods", label: "운동 용품" },
];

const BUILT_IN_KEYS = new Set(["membership", "group", "personal", "locker", "apparel", "goods"]);

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "month", label: "개월" },
  { value: "day", label: "일" },
  { value: "year", label: "년" },
];


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
  const [type, setType] = useState<string>(
    initial?.type || (scope === "personal" ? "personal" : "membership")
  );
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
      // 개인 상품: 개인 레슨을 1순위로, 그 다음 그룹 수업.
      return (["personal", "group"] as const)
        .map((v) => BUILT_IN_TYPES.find((bi) => bi.value === v)!)
        .map((bi) => ({ ...bi, label: overrides.get(bi.value) ?? bi.label }));
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

  // 헬스장 시설 이용권(회원권/락커/운동복) = 기간제·개월·1 을 기본으로.
  const FACILITY_TYPES = ["membership", "locker", "apparel"] as const;
  const isFacility = (t: string) =>
    (FACILITY_TYPES as readonly string[]).includes(t);

  const [billingMode, setBillingMode] = useState<BillingMode>(
    initial?.billing_mode ?? (isFacility(type) ? "period" : "count")
  );
  const [name, setName] = useState(initial?.name ?? "");
  // 기간 설정: 시설 이용권이면 개월/1, 그 외엔 기존(일/40)
  const [durationValue, setDurationValue] = useState(
    initial?.duration_value ?? (isFacility(type) ? 1 : 40)
  );
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    (initial?.duration_unit as DurationUnit) ?? (isFacility(type) ? "month" : "day")
  );
  // 유효 기간 기본 40일 (무기한 기본 체크 X)
  const [serviceDays, setServiceDays] = useState(initial?.service_days ?? 40);
  const [totalSessions, setTotalSessions] = useState(initial?.total_sessions ?? 10);
  const [pauseEnabled, setPauseEnabled] = useState(initial?.pause_enabled ?? false);
  const [pauseDays, setPauseDays] = useState(initial?.pause_days ?? 0);
  const [pauseCount, setPauseCount] = useState(initial?.pause_count ?? 0);
  const [mileageEarn, setMileageEarn] = useState(initial?.mileage_earn ?? 0);
  const [mileageUsable, setMileageUsable] = useState(initial?.mileage_usable ?? true);
  // 출석 시 마일리지 적립: 헬스 이용권(membership) + 수강권(personal/group) 만 노출
  const [attendanceMileageEnabled, setAttendanceMileageEnabled] = useState<boolean>(
    (initial?.attendance_mileage_earn ?? 0) > 0
  );
  const [attendanceMileageEarn, setAttendanceMileageEarn] = useState<number>(
    initial?.attendance_mileage_earn ?? 0
  );
  // 상품 판매 가격 (판매 시 자동으로 채워짐).
  const [priceWon, setPriceWon] = useState<number>(initial?.price_won ?? 0);
  // 부가세 포함 여부 (가격 입력 옆 체크).
  const [vatIncluded, setVatIncluded] = useState<boolean>(initial?.vat_included ?? false);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 2);
  const [sessionMinutes, setSessionMinutes] = useState(initial?.session_minutes ?? 50);

  // 회원권 전용: 일일 입장 가능 횟수 (0 = 무제한 sentinel)
  const [dailyCheckInLimit, setDailyCheckInLimit] = useState<number>(
    initial?.daily_check_in_limit ?? 1
  );
  const [dailyUnlimited, setDailyUnlimited] = useState<boolean>(
    (initial?.daily_check_in_limit ?? 1) === 0
  );

  // 회원권 전용: 입장 가능 요일/시간
  // '무제한' = 매일 00:00~23:59, '설정' = 사용자 지정.
  const initOperatingDays: number[] = initial?.operating_days ?? [0, 1, 2, 3, 4, 5, 6];
  const initOpenTime = initial?.open_time ?? "00:00";
  const initCloseTime = initial?.close_time ?? "23:59";
  const isAllDayInit =
    initOperatingDays.length === 7 &&
    initOpenTime.startsWith("00:00") &&
    initCloseTime.startsWith("23:59");
  const [accessMode, setAccessMode] = useState<"unlimited" | "custom">(
    isAllDayInit ? "unlimited" : "custom"
  );
  const [operatingDays, setOperatingDays] = useState<number[]>(initOperatingDays);
  const [openTime, setOpenTime] = useState<string>(
    initOpenTime.startsWith("00:00") ? "09:00" : initOpenTime.slice(0, 5)
  );
  const [closeTime, setCloseTime] = useState<string>(
    initCloseTime.startsWith("23:59") ? "18:00" : initCloseTime.slice(0, 5)
  );
  const [is24h, setIs24h] = useState<boolean>(
    initOpenTime.startsWith("00:00") && initCloseTime.startsWith("23:59") && !isAllDayInit
  );
  // 하루 이용 시간 제한 UI 제거됨 — 항상 false 로 저장.
  const dailyTimeLimitEnabled = false;

  // type 이 바뀔 때 시설 이용권이면 이용 방식·기간을 기본값으로 재설정 (create 모드만)
  useEffect(() => {
    if (mode === "edit") return;
    if (isFacility(type)) {
      setBillingMode("period");
      setDurationUnit("month");
      setDurationValue(1);
    } else if (type === "group" || type === "personal") {
      setBillingMode("count");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  // 상품 설명 UI 제거됨 — 편집 시 기존 값 보존, 신규는 null.
  const description: string | null = initial?.description ?? null;
  // 묶음 구성 상품 — 상단 상품에 함께 발급될 다른 상품들. 판매 시 한 결제로 전개.
  const [components, setComponents] = useState<BundleComponent[]>(initial?.components ?? []);
  // 유형별 기본값으로 구성 상품 한 줄 추가
  const addComponent = (compType: string) => {
    const isLesson = compType === "personal" || compType === "group";
    setComponents((prev) => [
      ...prev,
      {
        type: compType,
        name: "",
        price_won: 0,
        billing_mode: isLesson ? "count" : "period",
        duration_value: isLesson ? 0 : 30,
        total_sessions: isLesson ? 10 : 0,
        session_minutes: isLesson ? 50 : 0,
      },
    ]);
  };
  const updateComponent = (i: number, patch: Partial<BundleComponent>) =>
    setComponents((prev) => prev.map((c, x) => (x === i ? { ...c, ...patch } : c)));
  const removeComponent = (i: number) =>
    setComponents((prev) => prev.filter((_, x) => x !== i));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    if (!name.trim()) return setError("상품명을 입력해 주세요");
    if (billingMode === "period" && durationValue !== null && durationValue < 0)
      return setError("기간을 0 이상으로 입력해 주세요");
    if (billingMode === "count" && totalSessions !== null && totalSessions <= 0)
      return setError("총 횟수를 1 이상으로 입력해 주세요");
    if (type === "group" && capacity !== null && capacity <= 0)
      return setError("그룹 수업 정원을 1명 이상으로 입력해 주세요");
    if ((type === "personal" || type === "group") && sessionMinutes !== null && sessionMinutes <= 0)
      return setError("수업 시간을 1분 이상으로 입력해 주세요");
    if (type === "membership" && accessMode === "custom" && operatingDays.length === 0)
      return setError("입장 가능 요일을 하나 이상 선택해 주세요");

    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");

      // 회원권 입장 가능 요일/시간: 무제한이면 매일·00:00~23:59, 24시간 토글도 동일
      const effectiveDays =
        type === "membership" && accessMode === "custom" && !is24h
          ? operatingDays
          : [0, 1, 2, 3, 4, 5, 6];
      const effectiveOpen =
        type === "membership" && accessMode === "custom" && !is24h ? openTime : "00:00";
      const effectiveClose =
        type === "membership" && accessMode === "custom" && !is24h ? closeTime : "23:59";
      const effectiveDaily =
        type === "membership"
          ? dailyUnlimited
            ? 0
            : Math.max(1, dailyCheckInLimit || 1)
          : Math.max(1, dailyCheckInLimit || 1);

      const payload = {
        type,
        billing_mode: billingMode,
        name: name.trim(),
        description: description?.trim() || null,
        open_time: effectiveOpen,
        close_time: effectiveClose,
        operating_days: effectiveDays,
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
        daily_check_in_limit: effectiveDaily,
        daily_time_limit_enabled: dailyTimeLimitEnabled,
        components: components.map((c) => ({
          type: c.type,
          name: (c.name ?? "").trim(),
          price_won: Math.max(0, Math.floor(c.price_won ?? 0)),
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
              onClick={() => {
                if (m === billingMode) return;
                setBillingMode(m);
                // serviceDays 는 모드별 의미가 달라 기본값 재설정:
                //  - 횟수제: 유효 기간 40일  /  기간제: 서비스 기간 0일
                if (mode === "create") setServiceDays(m === "count" ? 40 : 0);
              }}
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
          placeholder={
            type === "membership"
              ? "예시 : 헬스 3개월 이용권"
              : type === "locker"
                ? "예시 : 락커 3개월"
                : type === "apparel"
                  ? "예시 : 운동복 3개월"
                  : type === "group"
                    ? "예시 : 2:1 그룹 PT 10회"
                    : "예시: 10회 PT 이용권"
          }
          className={crmInputClass}
          maxLength={60}
        />

        <div className="mt-3">
          <FieldLabel>판매 가격 (원)</FieldLabel>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={priceWon === 0 ? "" : formatWon(priceWon)}
              onChange={(e) => setPriceWon(parseWon(e.target.value))}
              placeholder="0"
              className={`${crmInputClass} pr-8 text-right tabular-nums`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#A89B80] pointer-events-none">
              원
            </span>
          </div>
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vatIncluded}
              onChange={(e) => setVatIncluded(e.target.checked)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              부가세(VAT) 포함 금액
            </span>
          </label>
          <p className="mt-1 text-[12px] text-[#A89B80]">
            회원에게 이 상품을 판매(결제)할 때 자동으로 채워지는 기본 금액이에요.
          </p>
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
                  onChange={(e) => setServiceDays(e.target.checked ? 0 : 40)}
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

      {/* 정지 · 홀딩 설정 */}
      <Section title="정지 · 홀딩 설정">
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
          <div className="mb-1 grid grid-cols-2 gap-2">
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
      </Section>

      {/* 회원권 전용: 일일 입장 가능 횟수 */}
      {type === "membership" && (
        <Section title="일일 입장 가능 횟수">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[160px]">
              <input
                type="number"
                min={1}
                disabled={dailyUnlimited}
                value={dailyCheckInLimit}
                onChange={(e) =>
                  setDailyCheckInLimit(Math.max(1, Number(e.target.value) || 1))
                }
                className={`${crmInputClass} pr-9 disabled:opacity-50`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
                회
              </span>
            </div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={dailyUnlimited}
                onChange={(e) => setDailyUnlimited(e.target.checked)}
                className="w-4 h-4 accent-[#6B7B3A]"
              />
              <span className="text-[13px] text-[#3A342A] dark:text-zinc-300">무제한</span>
            </label>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
            하루에 이 상품으로 입장할 수 있는 최대 횟수. 무제한이면 제한 없음.
          </p>
        </Section>
      )}

      {/* 회원권 전용: 입장 가능 요일/시간 */}
      {type === "membership" && (
        <Section title="입장 가능 요일 / 시간 설정">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <AccessModeButton
                active={accessMode === "unlimited"}
                title="상시 입장"
                onClick={() => {
                  setAccessMode("unlimited");
                  setOperatingDays([0, 1, 2, 3, 4, 5, 6]);
                  setIs24h(false);
                  setOpenTime("09:00");
                  setCloseTime("18:00");
                }}
              />
              <AccessModeButton
                active={accessMode === "custom"}
                title="요일·시간 지정"
                onClick={() => setAccessMode("custom")}
              />
            </div>

            {accessMode === "unlimited" ? (
              <div className="rounded-lg border border-[#E8E0D0] bg-[#FBF7EB]/55 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/30">
                <p className="text-[12px] leading-relaxed text-[#8C8270] dark:text-zinc-500">
                  현재 설정: 매일 24시간 입장 가능
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-[#E8E0D0] bg-[#FBF7EB]/45 p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[12px] text-[#8C8270] dark:text-zinc-500">
                    선택한 요일과 시간에만 입장할 수 있어요.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAccessMode("unlimited");
                      setOperatingDays([0, 1, 2, 3, 4, 5, 6]);
                      setIs24h(false);
                      setOpenTime("09:00");
                      setCloseTime("18:00");
                    }}
                    className="shrink-0 text-[12px] font-semibold text-[#6B7B3A] hover:underline dark:text-[#A8B87A]"
                  >
                    상시 입장
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <FieldLabel>입장 가능 요일</FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => {
                        const on = operatingDays.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setOperatingDays((cur) =>
                                on ? cur.filter((x) => x !== i) : [...cur, i].sort()
                              )
                            }
                            className={`h-9 min-w-9 rounded-lg border px-3 text-[13px] font-semibold transition-colors
                              ${on
                                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                                : "border-[#E8E0D0] bg-[#FEFCF7] text-[#3A342A] hover:border-[#6B7B3A]/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                              }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <FieldLabel>입장 시간</FieldLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        disabled={is24h}
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        className={`${crmInputClass} max-w-[130px] disabled:opacity-50`}
                      />
                      <span className="text-[13px] text-[#A89B80]">~</span>
                      <input
                        type="time"
                        disabled={is24h}
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        className={`${crmInputClass} max-w-[130px] disabled:opacity-50`}
                      />
                      <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E8E0D0] bg-[#FEFCF7] px-3 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900">
                        <input
                          type="checkbox"
                          checked={is24h}
                          onChange={(e) => setIs24h(e.target.checked)}
                          className="w-4 h-4 accent-[#6B7B3A]"
                        />
                        <span className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-300">
                          24시간 입장
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

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

        {(type === "membership" || type === "personal" || type === "group") && (
          <div className="mt-4 pt-3 border-t border-[#E8E0D0] dark:border-zinc-800">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={attendanceMileageEnabled}
                onChange={(e) => setAttendanceMileageEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#6B7B3A]"
              />
              <span className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
                출석 시 마일리지 적립
              </span>
            </label>
            {attendanceMileageEnabled && (
              <div className="mt-2 relative max-w-[220px]">
                <input
                  type="number"
                  min={0}
                  value={attendanceMileageEarn}
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
            )}
            <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
              이 상품을 이용하는 회원이 체크인할 때마다 자동 적립됩니다. (하루 1회)
            </p>
          </div>
        )}
      </Section>

      {/* 묶음 구성 상품 — 상단 상품에 함께 발급될 다른 상품을 붙여 하나의 묶음으로 판매 */}
      {(type === "personal" || type === "group" || type === "membership" || components.length > 0) && (
        <Section title="묶음 상품 구성">
          <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mb-3 leading-relaxed">
            아래에 구성 상품을 추가하면 <b>하나의 묶음 상품</b>으로 판매돼요. 판매(결제) 시 상단 상품과 구성 상품이 <b>함께 발급</b>되고, 결제 금액은 <b>모든 가격의 합산</b>입니다.
          </p>

          {components.length > 0 && (
            <div className="space-y-2.5 mb-3">
              {components.map((c, i) => {
                const compLabel = BUILT_IN_TYPES.find((t) => t.value === c.type)?.label ?? c.type;
                const isLesson = c.type === "personal" || c.type === "group";
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/50 dark:bg-zinc-900/50 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[11.5px] font-semibold bg-[#6B7B3A]/12 text-[#6B7B3A] dark:text-[#A8B87A]">
                        구성 {i + 1} · {compLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeComponent(i)}
                        className="px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        삭제
                      </button>
                    </div>

                    <div>
                      <FieldLabel>상품명</FieldLabel>
                      <input
                        type="text"
                        value={c.name ?? ""}
                        onChange={(e) => updateComponent(i, { name: e.target.value })}
                        placeholder={isLesson ? "예: 개인 PT 10회" : compLabel + " 상품명"}
                        className={crmInputClass}
                        maxLength={60}
                      />
                    </div>

                    <div>
                      <FieldLabel>판매 가격 (원)</FieldLabel>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={(c.price_won ?? 0) === 0 ? "" : formatWon(c.price_won ?? 0)}
                          onChange={(e) => updateComponent(i, { price_won: parseWon(e.target.value) })}
                          placeholder="0"
                          className={`${crmInputClass} pr-8 text-right tabular-nums`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#A89B80] pointer-events-none">
                          원
                        </span>
                      </div>
                    </div>

                    <div>
                      <FieldLabel>이용 방식</FieldLabel>
                      <div className="flex gap-1.5">
                        {(["period", "count"] as const).map((bm) => (
                          <button
                            key={bm}
                            type="button"
                            onClick={() => updateComponent(i, { billing_mode: bm })}
                            className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium border ${
                              c.billing_mode === bm
                                ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                                : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[#3A342A] dark:text-zinc-300"
                            }`}
                          >
                            {bm === "period" ? "기간제" : "횟수제"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {c.billing_mode === "period" ? (
                        <div>
                          <FieldLabel>기간 (일)</FieldLabel>
                          <input
                            type="number"
                            min={0}
                            value={c.duration_value ?? 0}
                            onChange={(e) => updateComponent(i, { duration_value: Math.max(0, Number(e.target.value) || 0) })}
                            className={crmInputClass}
                          />
                        </div>
                      ) : (
                        <div>
                          <FieldLabel>총 횟수</FieldLabel>
                          <input
                            type="number"
                            min={0}
                            value={c.total_sessions ?? 0}
                            onChange={(e) => updateComponent(i, { total_sessions: Math.max(0, Number(e.target.value) || 0) })}
                            className={crmInputClass}
                          />
                        </div>
                      )}
                      {isLesson && (
                        <div>
                          <FieldLabel>수업 시간 (분)</FieldLabel>
                          <input
                            type="number"
                            min={0}
                            value={c.session_minutes ?? 0}
                            onChange={(e) => updateComponent(i, { session_minutes: Math.max(0, Number(e.target.value) || 0) })}
                            className={crmInputClass}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 유형별 추가 버튼 */}
          {(type === "personal" || type === "group") && (
            <button
              type="button"
              onClick={() => addComponent("membership")}
              className="w-full px-3.5 py-2.5 rounded-lg text-[13px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
            >
              + 회원권 추가하고 묶음 상품 만들기
            </button>
          )}
          {type === "membership" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => addComponent("locker")}
                className="px-3 py-2.5 rounded-lg text-[12.5px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
              >
                + 락커 상품 추가
              </button>
              <button
                type="button"
                onClick={() => addComponent("apparel")}
                className="px-3 py-2.5 rounded-lg text-[12.5px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
              >
                + 운동복 상품 추가
              </button>
              <button
                type="button"
                onClick={() => addComponent("personal")}
                className="px-3 py-2.5 rounded-lg text-[12.5px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
              >
                + 수강권 추가
              </button>
            </div>
          )}

          {components.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#E8E0D0] dark:border-zinc-800 flex items-baseline justify-between">
              <span className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-300">묶음 결제 금액 (합산)</span>
              <span className="text-[16px] font-extrabold text-[#3A342A] dark:text-zinc-100 tabular-nums">
                {formatWon(priceWon + components.reduce((s, c) => s + Math.max(0, c.price_won ?? 0), 0))}원
              </span>
            </div>
          )}
        </Section>
      )}

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

function AccessModeButton({
  active,
  title,
  onClick,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
        active
          ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
          : "border-[#E8E0D0] bg-[#FEFCF7] text-[#3A342A] hover:border-[#6B7B3A]/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          active
            ? "bg-white"
            : "bg-[#CFC2AA] dark:bg-zinc-600"
        }`}
      />
      {title}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
      {children}
    </div>
  );
}
