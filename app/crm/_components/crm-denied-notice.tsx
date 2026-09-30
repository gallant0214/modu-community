"use client";

/**
 * 권한이 없어 데이터를 못 불러왔을 때 쓰는 안내.
 *
 * 🚨 예전엔 403 을 조용히 삼켜 매출이 '0원', 목록이 '없음' 으로 보였다.
 *    숫자를 오해하는 게 권한 안내를 보는 것보다 훨씬 위험하다.
 */
export function CrmDeniedNotice({
  message,
  what,
  className = "",
}: {
  /** 서버가 준 사유 (없으면 기본 문구) */
  message?: string | null;
  /** 무엇을 못 봤는지 — "수업료", "센터 매출" 등 */
  what?: string;
  className?: string;
}) {
  return (
    <div
      className={`px-4 py-6 rounded-xl border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/60 dark:bg-zinc-900/50 text-center ${className}`}
    >
      <div className="text-[13.5px] font-semibold text-[#6B5D47] dark:text-zinc-300">
        {message?.trim() || `${what ?? "이 정보"}를 볼 권한이 없어요`}
      </div>
      <div className="mt-1 text-[12px] text-[#A89B80]">
        숫자가 0으로 보이는 게 아니라 <b>권한이 없어 불러오지 못한 것</b>입니다. 필요하면
        센터 관리자에게 권한을 요청해 주세요.
      </div>
    </div>
  );
}
