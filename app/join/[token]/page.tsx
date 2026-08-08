"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

// 회원용 앱 스토어 (com.moduji.member)
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.moduji.member";
// TODO: 회원용 앱(com.moduji.member) 실제 App Store ID 로 교체 필요
const IOS_URL = "https://apps.apple.com/kr/app/id0000000000";
const APP_SCHEME = "moducmmember"; // app.json scheme

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export default function JoinLandingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [center, setCenter] = useState<{ centerId: number; centerName: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<Platform>("other");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/join/resolve?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "유효하지 않은 링크예요");
      setCenter(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) resolve();
  }, [token, resolve]);

  const storeUrl = platform === "ios" ? IOS_URL : ANDROID_URL;

  // 설치 후에도 센터를 기억시키기 위해 클립보드에 조인 토큰 복사 → 스토어 이동.
  // 앱 첫 실행 시 클립보드를 읽어 이 센터로 가입을 연결한다.
  const goInstall = async () => {
    try {
      await navigator.clipboard.writeText(`moducm-join:${token}`);
      setCopied(true);
    } catch {
      /* 클립보드 실패해도 아래 가입코드 안내로 대체 */
    }
    // 앱이 이미 설치돼 있으면 스킴으로 바로 열림, 아니면 스토어로.
    const start = Date.now();
    setTimeout(() => {
      if (Date.now() - start < 1600) window.location.href = storeUrl;
    }, 1200);
    window.location.href = `${APP_SCHEME}://register?token=${encodeURIComponent(token)}`;
  };

  return (
    <div className="min-h-dvh bg-[#FBF7EB] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E8E0D0] shadow-sm px-6 py-8 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#6B7B3A]/12 flex items-center justify-center">
          <svg className="w-7 h-7 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {loading ? (
          <div className="py-8 text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : error ? (
          <>
            <div className="text-[16px] font-bold text-[#2A251D] mb-1">링크를 확인할 수 없어요</div>
            <div className="text-[13px] text-[#8C8270]">{error}</div>
          </>
        ) : center ? (
          <>
            <div className="text-[12.5px] text-[#8C8270]">아래 센터로 회원가입</div>
            <h1 className="mt-1 text-[22px] font-extrabold text-[#2A251D]">{center.centerName}</h1>
            <p className="mt-3 text-[13px] text-[#6B5D47] leading-relaxed">
              모두의지도사 <b>회원용 앱</b>을 설치하고 실행하면
              <br /><b>{center.centerName}</b>으로 가입이 연결돼요.
            </p>

            <button
              onClick={goInstall}
              className="mt-5 w-full px-4 py-3 rounded-xl bg-[#6B7B3A] text-white text-[15px] font-bold hover:bg-[#5a6932] transition-colors"
            >
              앱 설치하고 가입하기
            </button>
            <a
              href={storeUrl}
              className="mt-2 block text-[12px] text-[#8C8270] underline"
            >
              {platform === "ios" ? "App Store" : platform === "android" ? "Play 스토어" : "스토어"}에서 직접 열기
            </a>

            {copied && (
              <div className="mt-3 text-[11.5px] text-[#6B7B3A] font-medium">
                가입 정보가 복사됐어요. 앱을 실행하면 자동으로 이 센터에 연결됩니다.
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-[#EFE7D5] text-[11.5px] text-[#A89B80] leading-relaxed">
              앱에서 센터가 자동 연결되지 않으면, 가입 화면에서
              <br />센터 이름 <b>‘{center.centerName}’</b> 으로 검색해 선택해 주세요.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
