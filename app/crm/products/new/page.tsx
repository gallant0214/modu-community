"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../_components/crm-modal";
import { formatWon, parseWon } from "../../_components/crm-labels";

type ProductType = "membership" | "group" | "personal" | "locker" | "apparel" | "goods";
type BillingMode = "period" | "count";
type DurationUnit = "day" | "month" | "year";

const TYPE_OPTIONS: { value: ProductType; label: string }[] = [
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

const VALID_TYPES: ProductType[] = [
  "membership",
  "group",
  "personal",
  "locker",
  "apparel",
  "goods",
];

export default function CrmProductNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getIdToken } = useAuth();

  const initialType = (() => {
    const t = searchParams.get("type") as ProductType | null;
    return t && VALID_TYPES.includes(t) ? t : "membership";
  })();

  const [type, setType] = useState<ProductType>(initialType);
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
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border whitespace-nowrap
                ${type === opt.value
                  ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
          placeholder="예: 헬스, 필라테스, 요가, GX"
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
