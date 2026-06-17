"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";

type Tab = "assigned" | "unassigned" | "returns" | "settings";

const ZONE_COUNT = 8;
const ZONE_NAME_MAX = 6;

interface Zone {
  zone_number: number;
  name: string;
  locker_count: number;
  start_number: number;
}

export default function CrmLockersPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("assigned");
  const [zone, setZone] = useState<number>(1);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [error, setError] = useState("");

  // 배정 현황 필터
  const [status, setStatus] = useState<string>("");
  const [expireFilter, setExpireFilter] = useState<string>("");
  const [query, setQuery] = useState("");

  // 설정 폼 편집값
  const [zoneName, setZoneName] = useState("");
  const [lockerCount, setLockerCount] = useState("");
  const [startNumber, setStartNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const loadZones = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/lockers/zones", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setZones(data.zones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoadingZones(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  // 현재 선택된 구역
  const currentZone = useMemo(
    () => zones.find((z) => z.zone_number === zone),
    [zones, zone]
  );

  // 구역 바뀌거나 데이터 새로 로드되면 폼 값 동기화
  useEffect(() => {
    if (currentZone) {
      setZoneName(currentZone.name);
      setLockerCount(String(currentZone.locker_count));
      setStartNumber(String(currentZone.start_number));
    } else {
      setZoneName(`구역 ${zone}`);
      setLockerCount("");
      setStartNumber("");
    }
    setSavedMsg("");
  }, [currentZone, zone]);

  // 칩 라벨은 저장된 name 우선
  const zoneLabel = useCallback(
    (n: number) => zones.find((z) => z.zone_number === n)?.name ?? `구역 ${n}`,
    [zones]
  );

  const dirty = useMemo(() => {
    if (!currentZone) return true;
    return (
      zoneName.trim() !== currentZone.name ||
      Number(lockerCount || 0) !== currentZone.locker_count ||
      Number(startNumber || 1) !== currentZone.start_number
    );
  }, [currentZone, zoneName, lockerCount, startNumber]);

  const save = async () => {
    if (saving) return;
    setError("");
    setSavedMsg("");
    const nameTrim = zoneName.trim();
    if (!nameTrim) {
      setError("구역명을 입력해 주세요");
      return;
    }
    if (nameTrim.length > ZONE_NAME_MAX) {
      setError(`구역명은 ${ZONE_NAME_MAX}자 이내로 입력해 주세요`);
      return;
    }
    const count = Number(lockerCount || 0);
    if (!Number.isInteger(count) || count < 0) {
      setError("락커 갯수는 0 이상의 정수여야 해요");
      return;
    }
    const start = Number(startNumber || 1);
    if (!Number.isInteger(start) || start < 1) {
      setError("시작 번호는 1 이상의 정수여야 해요");
      return;
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/zones/${zone}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: nameTrim,
          locker_count: count,
          start_number: start,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setSavedMsg("저장되었습니다");
      await loadZones();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          락커
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          회원에게 락커를 배정하고 만료를 관리해요.
        </p>
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === "assigned"} onClick={() => setTab("assigned")}>
          배정 현황
        </TabBtn>
        <TabBtn active={tab === "unassigned"} onClick={() => setTab("unassigned")}>
          미배정자
        </TabBtn>
        <TabBtn active={tab === "returns"} onClick={() => setTab("returns")}>
          회수 기록
        </TabBtn>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>
          락커 설정
        </TabBtn>
      </div>

      {tab === "assigned" && (
        <>
          <Notice>
            만료 시, 자동으로 락커가 회수되지 않아요. 락커 현황을 확인해 락커 관리를 해 주세요.
          </Notice>

          <ZoneChips zone={zone} onChange={setZone} zoneLabel={zoneLabel} />

          <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                락커 목록 (0명)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={crmInputClass}
              >
                <option value="">상태</option>
                <option value="valid">유효</option>
                <option value="expiring">만료 임박</option>
                <option value="expired">만료</option>
              </select>
              <input
                type="date"
                value={expireFilter}
                onChange={(e) => setExpireFilter(e.target.value)}
                className={crmInputClass}
                aria-label="만료 예정일"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="회원 이름 또는 락커 번호로 검색"
                className={crmInputClass}
              />
            </div>

            <EmptyState>데이터가 없어요</EmptyState>
          </section>
        </>
      )}

      {tab === "unassigned" && (
        <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
            미배정자 목록 (0명)
          </h2>

          <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
            <table className="w-full text-[13px]">
              <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
                <tr>
                  <Th>이름</Th>
                  <Th>회원 유형</Th>
                  <Th>연락처</Th>
                  <Th>구매 상품</Th>
                  <Th>결제 일시</Th>
                  <Th>락커 시작일</Th>
                  <Th>락커 만료일</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center">
                    <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                      데이터가 없어요
                    </div>
                    <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                      미배정자가 없어요.
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Pagination page={1} totalPages={1} />
        </section>
      )}

      {tab === "returns" && (
        <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
            회수 처리 (0건)
          </h2>

          <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
            <table className="w-full text-[13px]">
              <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
                <tr>
                  <Th>이름</Th>
                  <Th>락커 구역</Th>
                  <Th>회수 전 락커 번호</Th>
                  <Th>비밀번호</Th>
                  <Th>회수일</Th>
                  <Th>처리자</Th>
                  <Th>비고</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center">
                    <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                      데이터가 없어요
                    </div>
                    <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                      회수 기록이 없어요.
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "settings" && (
        <>
          <ZoneChips zone={zone} onChange={setZone} zoneLabel={zoneLabel} />

          <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-3">
            <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
              기본 설정
            </h2>

            {loadingZones ? (
              <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
            ) : (
              <div className="space-y-3.5">
                <Field label="구역명">
                  <div className="relative">
                    <input
                      type="text"
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value.slice(0, ZONE_NAME_MAX))}
                      maxLength={ZONE_NAME_MAX}
                      className={`${crmInputClass} pr-12`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A89B80] dark:text-zinc-500 pointer-events-none">
                      {zoneName.length}/{ZONE_NAME_MAX}
                    </span>
                  </div>
                </Field>

                <Field label="락커 갯수">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lockerCount}
                    onChange={(e) => setLockerCount(e.target.value.replace(/\D/g, ""))}
                    placeholder="락커 갯수를 입력해 주세요."
                    className={crmInputClass}
                  />
                </Field>

                <Field label="시작 번호">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={startNumber}
                    onChange={(e) => setStartNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="시작 번호를 입력해 주세요."
                    className={crmInputClass}
                  />
                </Field>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
            <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
              락커 배치도
            </h2>

            <EmptyState>데이터가 없어요</EmptyState>
          </section>

          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[#6B7B3A]/10 text-[13px] text-[#6B7B3A] dark:text-[#A8B87A]">
              {savedMsg}
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || !dirty}
            className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] transition-colors"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </>
      )}
    </div>
  );
}

function ZoneChips({
  zone,
  onChange,
  zoneLabel,
}: {
  zone: number;
  onChange: (n: number) => void;
  zoneLabel: (n: number) => string;
}) {
  return (
    <div className="flex gap-1.5 mt-5 mb-4 overflow-x-auto -mx-1 px-1">
      {Array.from({ length: ZONE_COUNT }).map((_, i) => {
        const n = i + 1;
        const active = zone === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors
              ${active
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
          >
            {zoneLabel(n)}
          </button>
        );
      })}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap
        ${active
          ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
          : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300"
        }`}
    >
      {children}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed flex items-start gap-2">
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#B47B2A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange?: (next: number) => void;
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px]">
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onChange?.(page - 1)}
        className="px-2 py-1 rounded text-[#6B5D47] dark:text-zinc-400 disabled:opacity-40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
        aria-label="이전 페이지"
      >
        ‹
      </button>
      <span className="text-[#3A342A] dark:text-zinc-300 font-medium">{page}</span>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onChange?.(page + 1)}
        className="px-2 py-1 rounded text-[#6B5D47] dark:text-zinc-400 disabled:opacity-40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
        aria-label="다음 페이지"
      >
        ›
      </button>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
