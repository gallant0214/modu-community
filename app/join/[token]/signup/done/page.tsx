"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// 회원용 앱 스토어 (com.moduji.member / App Store id 6797501332)
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.moduji.member";
const IOS_URL = "https://apps.apple.com/kr/app/id6797501332";
const APP_SCHEME = "moducmmember";

type Platform = "ios" | "android" | "other";
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/* 신규 웹 가입 완료 화면 — 결제 성공 후 이곳으로 이동.
   이용권은 센터 CRM 에 이미 발급됐고, 여기서 회원용 앱 설치 + 기존 회원 연동을 안내한다. */
export default function SignupDonePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const storeUrl = platform === "ios" ? IOS_URL : ANDROID_URL;
  const goInstall = async () => {
    try {
      await navigator.clipboard.writeText(`moducm-join:${token}`);
    } catch {
      /* 무시 */
    }
    const start = Date.now();
    setTimeout(() => {
      if (Date.now() - start < 1600) window.location.href = storeUrl;
    }, 1200);
    window.location.href = `${APP_SCHEME}://register?token=${encodeURIComponent(token)}`;
  };

  return (
    <div className="min-h-[100dvh] bg-[#FBF7EB] flex justify-center">
      <div className="w-full max-w-[460px] px-5 py-10 flex flex-col">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-[#6B7B3A]/12 flex items-center justify-center text-[#6B7B3A] text-[32px] font-bold">
          ✓
        </div>
        <h1 className="text-[22px] font-extrabold text-[#2A251D] text-center">가입이 완료됐어요</h1>
        <p className="mt-2 text-center text-[13px] text-[#6B5D47] leading-relaxed">
          결제가 완료되어 이용권이 등록됐습니다.
          <br />이제 <b>회원용 앱</b>을 설치하면 내 이용권·출석·예약을 관리할 수 있어요.
        </p>

        <button
          onClick={goInstall}
          className="mt-7 w-full px-4 py-3.5 rounded-2xl bg-[#6B7B3A] text-white text-[16px] font-bold hover:bg-[#5a6932] transition-colors"
        >
          회원용 앱 설치하기
        </button>
        <a href={storeUrl} className="mt-2 block text-center text-[12px] text-[#8C8270] underline">
          {platform === "ios" ? "App Store" : platform === "android" ? "Play 스토어" : "스토어"}에서 직접 열기
        </a>

        {/* 앱 설치 후 내 가입정보 연동 안내 */}
        <div className="mt-8 rounded-2xl border border-[#E8E0D0] bg-white p-5">
          <div className="text-[14px] font-bold text-[#2A251D] mb-2">앱 설치 후, 이렇게 연동하세요</div>
          <ol className="space-y-2 text-[13px] text-[#3A342A] leading-relaxed list-decimal list-inside">
            <li>회원용 앱을 열고 <b>“기존 회원 연동”</b>을 선택</li>
            <li>방금 가입한 <b>센터명</b>과 <b>전화번호</b>를 입력</li>
            <li><b>연동하기</b>를 누르면 내 이용권이 앱에 연결돼요</li>
          </ol>
          <p className="mt-3 text-[11.5px] text-[#A89B80]">
            연동이 안 되면 센터에 문의해 주세요. 입력한 전화번호로 조회됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
