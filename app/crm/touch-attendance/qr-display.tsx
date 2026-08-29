"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/app/components/auth-provider";

/**
 * 키오스크(터치출석) 화면에 출석용 QR 표시.
 * QR 내용 = 센터 kiosk_token. 회원 앱이 이 QR을 스캔해
 * POST /api/crm/member-app/check-in { kiosk_token } 로 본인 출석.
 * - 공개 링크 모드: kioskToken prop 사용
 * - CRM 로그인 모드: /api/crm/kiosk-link 로 토큰 조회(없으면 발급 안내)
 */
export default function QrDisplay({ kioskToken }: { kioskToken?: string }) {
  const { getIdToken } = useAuth();
  const [token, setToken] = useState<string | null>(kioskToken ?? null);
  const [loading, setLoading] = useState(!kioskToken);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (kioskToken) {
      setToken(kioskToken);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const t = await getIdToken();
        if (!t) throw new Error("no-auth");
        const res = await fetch("/api/crm/kiosk-link", {
          headers: { authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        const d = await res.json();
        setToken(d.token ?? null);
        if (!d.token) setErr("공개 터치출석 링크를 먼저 만들어 주세요. (설정 → 터치출석)");
      } catch {
        setErr("QR을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [kioskToken, getIdToken]);

  return (
    <div className="flex flex-col items-center gap-[clamp(12px,2.5vmin,24px)]">
      <div className="rounded-3xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white p-[clamp(16px,3vmin,36px)] shadow-sm">
        {loading ? (
          <div className="w-[min(60vmin,360px)] aspect-square flex items-center justify-center text-[#8C8270]">
            불러오는 중…
          </div>
        ) : token ? (
          <QRCodeSVG
            value={token}
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
    </div>
  );
}
