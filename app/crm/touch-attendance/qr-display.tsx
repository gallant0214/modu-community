"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/app/components/auth-provider";

/**
 * 키오스크(터치출석) 화면에 출석용 QR 표시.
 * QR 내용 = 센터의 '주간 회전 토큰'(q1.…). 매주 자동으로 바뀌며,
 * 창을 열어둔 채 새로고침하지 않아도 주 경계 시각에 자동으로 갱신된다.
 * 회원 앱이 이 QR을 스캔해 POST /api/crm/member-app/check-in { kiosk_token } 로 본인 출석.
 * - 공개 링크 모드: kioskToken(정적 URL 토큰)으로 /api/touch/[token]/qr 조회
 * - CRM 로그인 모드: /api/crm/kiosk-link 조회
 */
export default function QrDisplay({
  kioskToken,
  fit,
}: {
  kioskToken?: string;
  /** true면 부모 높이에 꽉 차는 정사각형으로 표시(QR+번호 등 합성 모드에서 위아래 자동 맞춤) */
  fit?: boolean;
}) {
  const { getIdToken } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQr = useCallback(async () => {
    try {
      let data: { qr?: string | null; token?: string | null; next_rotate_at?: string | null } = {};
      if (kioskToken) {
        const res = await fetch(`/api/touch/${kioskToken}/qr`, { cache: "no-store" });
        data = await res.json().catch(() => ({}));
      } else {
        const t = await getIdToken();
        if (!t) throw new Error("no-auth");
        const res = await fetch("/api/crm/kiosk-link", {
          headers: { authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        data = await res.json().catch(() => ({}));
      }
      // 회전 토큰(qr) 우선, 없으면 정적 토큰 폴백
      const value = data.qr ?? data.token ?? (kioskToken || null);
      if (value) {
        setQr(value);
        setErr("");
      } else {
        setQr(null);
        setErr(
          kioskToken
            ? "QR을 표시할 수 없어요."
            : "공개 터치출석 링크를 먼저 만들어 주세요. (설정 → 터치출석)"
        );
      }
      // 다음 주 경계에 자동 갱신 예약 (탭 절전·시계 오차 대비 최대 1시간마다 재확인)
      if (timerRef.current) clearTimeout(timerRef.current);
      const nextAt = data.next_rotate_at ? new Date(data.next_rotate_at).getTime() : 0;
      const untilBoundary = nextAt ? nextAt - Date.now() + 5_000 : Number.POSITIVE_INFINITY;
      const delay = Math.min(Math.max(60_000, untilBoundary), 3600_000);
      timerRef.current = setTimeout(loadQr, delay);
    } catch {
      setErr("QR을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [kioskToken, getIdToken]);

  useEffect(() => {
    loadQr();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadQr]);

  // 태블릿이 절전/백그라운드에서 깨어나면 setTimeout 이 얼어붙어 QR 이 '지난 주 토큰'으로
  // 남아 회원이 스캔할 때 "유효하지 않은 QR" 오류가 날 수 있다. 화면이 다시 보이거나
  // 포커스를 얻거나 네트워크가 복구되면 즉시 최신 QR 로 갱신한다.
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadQr();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") loadQr();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [loadQr]);

  // 합성 모드(QR+번호 등): 부모가 준 높이/너비 안에서 '가장 큰 정사각형'으로 꽉 채워
  // 위아래가 잘리지 않도록 자동 맞춤. (absolute+m-auto = 박스에 내접하는 최대 정사각형)
  if (fit) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col items-center gap-[clamp(6px,1.4vmin,14px)]">
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          <div className="relative h-full w-full">
            <div className="absolute inset-0 m-auto aspect-square max-h-full max-w-full rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white p-[clamp(8px,1.8vmin,24px)] shadow-sm">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center text-[#8C8270]">
                  불러오는 중…
                </div>
              ) : qr ? (
                <QRCodeSVG value={qr} level="M" className="w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-center text-[13px] text-[#8C8270] p-4">
                  {err || "QR을 표시할 수 없어요."}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="shrink-0 text-[clamp(12px,1.6vmin,17px)] font-medium text-[#3A342A] dark:text-zinc-200 text-center leading-tight">
          회원 앱으로 이 QR을 스캔하면 출석돼요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-[clamp(12px,2.5vmin,24px)]">
      <div className="rounded-3xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white p-[clamp(16px,3vmin,36px)] shadow-sm">
        {loading ? (
          <div className="w-[min(60vmin,360px)] aspect-square flex items-center justify-center text-[#8C8270]">
            불러오는 중…
          </div>
        ) : qr ? (
          <QRCodeSVG
            value={qr}
            level="M"
            className="w-[min(60vmin,360px)] h-[min(60vmin,360px)]"
          />
        ) : (
          <div className="w-[min(60vmin,360px)] aspect-square flex items-center justify-center text-center text-[14px] text-[#8C8270] p-6">
            {err || "QR을 표시할 수 없어요."}
          </div>
        )}
      </div>
      <p className="text-[clamp(14px,2vmin,18px)] font-medium text-[#3A342A] dark:text-zinc-200 text-center">
        회원 앱으로 이 QR을 스캔하면 출석돼요.
      </p>
      <p className="text-[clamp(11px,1.4vmin,13px)] text-[#A89B80] text-center">
        보안을 위해 이 QR은 매주 자동으로 바뀝니다.
      </p>
    </div>
  );
}
