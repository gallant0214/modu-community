"use client";

import { useEffect, useState } from "react";

/**
 * 블루투스 자동 출석 — 터치출석 태블릿 APK(v1.3+)와 웹 화면 사이의 연결.
 *
 * APK 가 WebView 에 `window.ModuBeacon` 을 넣어 준다(일반 브라우저에는 없음 → 아무것도 안 함).
 * 웹 화면은 서버에서 1시간치 신호 값(5분 × 12개)을 받아 APK 에 넘기고, APK 가 시각에 맞춰
 * 차례로 블루투스 신호를 내보낸다. 코드 계산(비밀값)은 서버에만 있다.
 * 🚨 신호 값은 1시간에 한 번만 받는다(2026-11-21 Supabase 전송량 사고 — 짧은 폴링 금지).
 * 회원 폰이 이 신호를 가까이에서 감지하면 /api/crm/member-app/ble-check-in 으로 출석하고,
 * 그 출석은 기존 폴링(recent-checkin)으로 이 화면 확인창에 뜬다.
 */

interface BeaconBridge {
  setSchedule(json: string): string;
  stop(): void;
  status(): string;
}

export interface BeaconStatus {
  supported?: boolean;
  bluetoothOn?: boolean;
  permission?: boolean;
  advertising?: boolean;
}

const LS_ENABLED = "crm_touch_ble_enabled"; // 태블릿별. 기본 켜짐("0" 일 때만 꺼짐)
const RETRY_MS = 5 * 60 * 1000;

function getBridge(): BeaconBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { ModuBeacon?: BeaconBridge }).ModuBeacon;
  return b && typeof b.setSchedule === "function" ? b : null;
}

export function readBeaconStatus(): BeaconStatus | null {
  const b = getBridge();
  if (!b) return null;
  try {
    return JSON.parse(b.status()) as BeaconStatus;
  } catch {
    return null;
  }
}

/** 공개 터치출석(kioskToken) + 전용 APK 일 때만 동작. available=false 면 설정 모달에도 안 보인다. */
export function useKioskBeacon(kioskToken?: string) {
  // APK 가 페이지 로드 전에 브리지를 넣으므로 첫 렌더에 바로 알 수 있다
  const [available] = useState(() => !!getBridge());
  const [enabled, setEnabledState] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(LS_ENABLED) !== "0";
    } catch {
      return true; // 저장소 차단 — 기본 켜짐
    }
  });

  useEffect(() => {
    if (!available || !kioskToken) return;
    const bridge = getBridge();
    if (!bridge) return;
    if (!enabled) {
      try {
        bridge.stop();
      } catch {
        /* noop */
      }
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const res = await fetch(`/api/touch/${kioskToken}/beacon`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = await res.json();
        if (stopped) return;
        bridge.setSchedule(
          JSON.stringify({
            uuid: d.uuid,
            major: d.major,
            txPower: d.tx_power,
            measuredPower: d.measured_power,
            // APK 는 시각(epoch ms)만 보고 지금 창의 코드를 고른다. 코드가 다 끝나면 스스로 멈춘다.
            codes: (d.codes as { minor: number; from: string; to: string }[]).map((c) => ({
              minor: c.minor,
              from: Date.parse(c.from),
              to: Date.parse(c.to),
            })),
          })
        );
        const next = Math.max(60_000, Date.parse(d.refresh_at) - Date.now());
        timer = setTimeout(load, next);
      } catch {
        // 받아 둔 코드가 남아 있는 동안은 APK 가 계속 내보낸다. 5분 뒤 다시 시도.
        if (!stopped) timer = setTimeout(load, RETRY_MS);
      }
    };
    load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [available, enabled, kioskToken]);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(LS_ENABLED, v ? "1" : "0");
    } catch {
      /* noop */
    }
  };

  return { available, enabled, setEnabled };
}

function statusText(s: BeaconStatus | null, enabled: boolean): string {
  if (!enabled) return "꺼져 있어요. 터치출석은 그대로 쓸 수 있어요.";
  if (!s) return "확인 중…";
  if (s.supported === false) return "이 태블릿은 블루투스 신호를 보낼 수 없어요. 터치출석은 그대로 쓸 수 있어요.";
  if (s.permission === false) return "블루투스 권한이 필요해요. 앱을 완전히 종료한 뒤 다시 열어 허용해 주세요.";
  if (s.bluetoothOn === false) return "태블릿 블루투스가 꺼져 있어요. 설정에서 켜 주세요.";
  if (s.advertising) return "작동 중 — 회원 앱에서 블루투스 자동 출석을 켠 회원은 입구에서 자동으로 출석돼요.";
  return "준비 중…";
}

/** 설정 모달(톱니바퀴) 안 '블루투스 자동 출석' 섹션 — 모달이 열려 있을 때만 렌더된다 */
export function BleBeaconSettings({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const [status, setStatus] = useState<BeaconStatus | null>(() => readBeaconStatus());
  useEffect(() => {
    // 네이티브 상태 조회(기기 내부 호출, 네트워크 없음) — 권한 허용·블루투스 켜기가 바로 반영되게
    const t = setInterval(() => setStatus(readBeaconStatus()), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-5 pt-4 border-t border-[#E8E0D0] dark:border-zinc-800">
      <div className="text-[12.5px] text-[#8C8270] dark:text-zinc-500 mb-2">블루투스 자동 출석</div>
      <div className="grid grid-cols-2 gap-2">
        {([
          { v: true, label: "켜기" },
          { v: false, label: "끄기" },
        ] as const).map(({ v, label }) => {
          const active = enabled === v;
          return (
            <button
              key={label}
              onClick={() => onChange(v)}
              className={`px-4 py-2.5 rounded-xl border text-[14px] font-semibold transition-colors ${
                active
                  ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
            >
              {active ? "✓ " : ""}{label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[12px] text-[#8C8270] dark:text-zinc-500">{statusText(status, enabled)}</div>
    </div>
  );
}
