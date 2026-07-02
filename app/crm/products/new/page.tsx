"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../_components/crm-modal";
import { formatWon, parseWon } from "../../_components/crm-labels";

type BillingMode = "period" | "count";
type DurationUnit = "day" | "month" | "year";

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

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "month", label: "개월" },
  { value: "day", label: "일" },
  { value: "year", label: "년" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const DESC_MAX = 1000;

export default function CrmProductNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getIdToken } = useAuth();

  const initialType = searchParams.get("type") || "membership";

  const [customTypes, setCustomTypes] = useState<TypeOption[]>([]);
  const [type, setType] = useState<string>(initialType);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [addTypeError, setAddTypeError] = useState("");

  const typeOptions: TypeOption[] = useMemo(
    () => [...BUILT_IN_TYPES, ...customTypes],
    [customTypes]
  );

  // 커스텀 유형 로드
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
    if (type && customTypes.find((t) => t.id === id)?.value === type) {
      setType("membership");
    }
  };
  const [billingMode, setBillingMode] = useState<BillingMode>("period");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [openTime, setOpenTime] = useState("00:00");
  const [closeTime, setCloseTime] = useState("23:59");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [durationValue, setDurationValue] = useState(3);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("month");
  const [serviceDays, setServiceDays] = useState(0);
  const [totalSessions, setTotalSessions] = useState(10);
  const [pauseEnabled, setPauseEnabled] = useState(false);
  const [pauseDays, setPauseDays] = useState(0);
  const [priceText, setPriceText] = useState("");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [capacity, setCapacity] = useState(10);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    if (!name.trim()) {
      setError("상품명을 입력해 주세요");
      return;
    }
    if (billingMode === "period" && durationValue <= 0) {
      setError("기간을 1 이상으로 입력해 주세요");
      return;
    }
    if (billingMode === "count" && totalSessions <= 0) {
      setError("총 횟수를 1 이상으로 입력해 주세요");
      return;
    }
    if (priceWon < 0) {
      setError("금액을 확인해 주세요");
      return;
    }
    if (type === "group" && capacity <= 0) {
      setError("그룹 수업 정원을 1명 이상으로 입력해 주세요");
      return;
    }
    if ((type === "personal" || type === "group") && sessionMinutes <= 0) {
      setError("수업 시간을 1분 이상으로 입력해 주세요");
      return;
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");

      const res = await fetch("/api/crm/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          billing_mode: billingMode,
          category: category.trim() || null,
          name: name.trim(),
          description: description.trim() || null,
          open_time: openTime,
          close_time: closeTime,
          operating_days: days,
          duration_value: billingMode === "period" ? durationValue : 0,
          duration_unit: durationUnit,
          service_days: serviceDays,
          total_sessions: billingMode === "count" ? totalSessions : 0,
          pause_enabled: pauseEnabled,
          pause_days: pauseEnabled ? pauseDays : 0,
          price_won: priceWon,
          vat_included: vatIncluded,
          capacity: type === "group" ? capacity : 0,
          session_minutes: type === "personal" || type === "group" ? sessionMinutes : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      router.push("/crm/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setSaving(false);
    }
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          상품 추가
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          판매할 회원권/수업/락커/용품 정보를 입력해 주세요.
        </p>
      </header>

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
          {!showAddType ? (
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
          {(["period", "count"] as const).map((m) => (
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

      {/* 종류 (카테고리) */}
      <Section title="종류">
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="예: 헬스, PT, 필라테스, 요가, GX"
          className={crmInputClass}
          maxLength={40}
        />
      </Section>

      {/* 그룹 수업 정원 */}
      {type === "group" && (
        <Section title="그룹 정원" required>
          <FieldLabel>한 클래스 최대 인원</FieldLabel>
          <div className="relative">
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Math.max(0, Number(e.target.value) || 0))}
              className={`${crmInputClass} pr-9`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              명
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[5, 8, 10, 12, 15, 20].map((n) => (
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

        <div className="grid grid-cols-2 gap-3 mt-3">
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

      {/* 기간 및 횟수 설정 */}
      <Section title={billingMode === "period" ? "기간 설정" : "횟수 설정"}>
        {billingMode === "period" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>기간</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={durationValue}
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
                value={serviceDays}
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
                value={totalSessions}
                onChange={(e) => setTotalSessions(Math.max(0, Number(e.target.value) || 0))}
                className={crmInputClass}
              />
            </div>
            <div>
              <FieldLabel>유효 기간 (일)</FieldLabel>
              <input
                type="number"
                min={0}
                value={serviceDays}
                onChange={(e) => setServiceDays(Math.max(0, Number(e.target.value) || 0))}
                className={crmInputClass}
              />
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
                value={sessionMinutes}
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

      {/* 정지 / 금액 */}
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
          <div className="mb-3">
            <FieldLabel>최대 정지 기간 (일)</FieldLabel>
            <input
              type="number"
              min={0}
              value={pauseDays}
              onChange={(e) => setPauseDays(Math.max(0, Number(e.target.value) || 0))}
              className={crmInputClass}
            />
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

      {/* 상품 설명 */}
      <Section title="상품 설명">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
          placeholder="회원에게 보여줄 안내 문구를 입력해 주세요."
          rows={5}
          className={`${crmInputClass} resize-none`}
        />
        <div className="mt-1 text-right text-[11.5px] text-[#A89B80]">
          {description.length} / {DESC_MAX}
        </div>
      </Section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 pb-10">
        <Link
          href="/crm/products"
          className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
        >
          돌아가기
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
        >
          {saving ? "저장 중…" : "저장"}
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
