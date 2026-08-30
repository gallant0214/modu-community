"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

interface ClassProduct {
  id: number;
  name: string;
  capacity: number | null;
  session_minutes: number | null;
}
interface ClassSession {
  id: number;
  product_id: number;
  product_name: string | null;
  trainer_name: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
}

function fmt(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const mo = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  const dow = ["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()];
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${mo}/${d}(${dow}) ${hh}:${mm}`;
}
function hm(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export default function ClassSessionsPanel() {
  const { getIdToken } = useAuth();
  const [products, setProducts] = useState<ClassProduct[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 등록 폼
  const [productId, setProductId] = useState<number | "">("");
  const [date, setDate] = useState(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");
  const [capacity, setCapacity] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // 명단
  const [rosterOf, setRosterOf] = useState<number | null>(null);
  const [roster, setRoster] = useState<{ id: number; member_name: string; member_phone: string | null; status: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const h = { authorization: `Bearer ${token}` };
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 90 * 864e5 + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const [pRes, sRes] = await Promise.all([
        fetch("/api/crm/products?type=class", { headers: h, cache: "no-store" }),
        fetch(`/api/crm/class-sessions?from=${today}&to=${to}`, { headers: h, cache: "no-store" }),
      ]);
      if (pRes.ok) setProducts((await pRes.json()).products ?? []);
      if (sRes.ok) setSessions((await sRes.json()).sessions ?? []);
      else throw new Error((await sRes.json())?.error || "조회 실패");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProduct = products.find((p) => p.id === productId);

  const create = async () => {
    if (!productId || saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const startsAt = new Date(`${date}T${time}:00+09:00`).toISOString();
      const res = await fetch("/api/crm/class-sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          starts_at: startsAt,
          capacity: capacity > 0 ? capacity : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "등록 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number, booked: number) => {
    const msg =
      booked > 0
        ? `예약된 회원 ${booked}명이 있어요. 취소하면 예약이 모두 취소되고 차감이 원복됩니다. 진행할까요?`
        : "이 클래스 수업을 취소할까요?";
    if (!window.confirm(msg)) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/class-sessions/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) await load();
    } catch {
      /* ignore */
    }
  };

  const openRoster = async (id: number) => {
    if (rosterOf === id) {
      setRosterOf(null);
      return;
    }
    setRosterOf(id);
    setRoster([]);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/class-sessions/${id}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setRoster((await res.json()).bookings ?? []);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 등록 폼 */}
      <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
        <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">클래스 수업 등록</div>
        {products.length === 0 ? (
          <div className="text-[12.5px] text-[#8C8270]">
            먼저 상품 관리에서 <strong>클래스</strong> 유형 상품을 만들어 주세요.
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
              클래스 상품
              <select
                value={productId}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : "";
                  setProductId(v);
                  const p = products.find((x) => x.id === v);
                  setCapacity(p?.capacity ?? 0);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100 min-w-[160px]"
              >
                <option value="">선택</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
              날짜
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
              시작 시간
              <input
                type="time"
                value={time}
                step={1800}
                onChange={(e) => setTime(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
              정원
              <input
                type="number"
                min={1}
                value={capacity || ""}
                onChange={(e) => setCapacity(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
            </label>
            <button
              type="button"
              onClick={create}
              disabled={!productId || saving}
              className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
            >
              {saving ? "등록 중…" : "등록"}
            </button>
          </div>
        )}
        {selectedProduct && (
          <div className="mt-2 text-[11.5px] text-[#A89B80]">
            수업 시간 {selectedProduct.session_minutes || 60}분 · 기본 정원 {selectedProduct.capacity || 0}명
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 세션 목록 */}
      <div>
        <div className="text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
          예정된 클래스 수업 ({sessions.length})
        </div>
        {loading ? (
          <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            등록된 클래스 수업이 없어요.
          </div>
        ) : (
          <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
            {sessions.map((s) => {
              const full = s.booked_count >= s.capacity;
              return (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                          {fmt(s.starts_at)}~{hm(s.ends_at)}
                        </span>
                        <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                          {s.product_name}
                        </span>
                        {s.trainer_name && (
                          <span className="text-[11.5px] text-[#A89B80]">· {s.trainer_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${
                          full
                            ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            : "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A]"
                        }`}
                      >
                        {s.booked_count}/{s.capacity}명{full ? " 마감" : ""}
                      </span>
                      <button
                        onClick={() => openRoster(s.id)}
                        className="px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        명단
                      </button>
                      <button
                        onClick={() => remove(s.id, s.booked_count)}
                        className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-900 text-[12px] text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                  {rosterOf === s.id && (
                    <div className="mt-2 pt-2 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
                      {roster.length === 0 ? (
                        <div className="text-[12px] text-[#A89B80]">예약한 회원이 없어요.</div>
                      ) : (
                        <ul className="space-y-1">
                          {roster.map((r) => (
                            <li key={r.id} className="text-[12.5px] text-[#3A342A] dark:text-zinc-300 flex items-center gap-2">
                              <span className="font-medium">{r.member_name}</span>
                              {r.member_phone && <span className="text-[#A89B80]">{r.member_phone}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
