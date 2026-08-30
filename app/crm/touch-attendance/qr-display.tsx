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
export default function QrDisplay({ kioskToken }: { kioskToken?: string }) {
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
      // 다음 주 경계에 자동 갱신 예약 (탭 절전·시계 오차 대비 최대 6시간마다 재확인)
      if (timerRef.current) clearTimeout(timerRef.current);
      const nextAt = data.next_rotate_at ? new Date(data.next_rotate_at).getTime() : 0;
      const untilBoundary = nextAt ? nextAt - Date.now() + 5_000 : Number.POSITIVE_INFINITY;
      const delay = Math.min(Math.max(60_000, untilBoundary), 6 * 3600_000);
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
