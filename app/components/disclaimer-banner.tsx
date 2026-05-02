interface Props {
  updatedAt?: string | null;
}

export default function DisclaimerBanner({ updatedAt }: Props) {
  const date = updatedAt ? new Date(updatedAt).toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : null;
  return (
    <div className="border border-[#E8E0D0] dark:border-zinc-700 bg-[#FFFBF1] dark:bg-zinc-900/50 rounded-xl px-4 py-3 mb-4 text-[12.5px] leading-[1.7] text-[#6B5D47] dark:text-zinc-300">
      <p>
        ⓘ 본 정보는 모두컴 운영자가 공식 자료를 정리한 <strong>참고용</strong>입니다.<br />
        정확한 최신 정보는 반드시 공식 출처에서 직접 확인하세요.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
        <a href="https://sqms.kspo.or.kr" target="_blank" rel="noreferrer noopener" className="text-[#6B7B3A] dark:text-[#A8B87A] hover:underline font-bold">
          👉 체육지도자 홈페이지
        </a>
        <span className="text-[#A89B80]">·</span>
        <span className="font-bold">📞 1833-4025</span>
        {date && (
          <>
            <span className="text-[#A89B80]">·</span>
            <span className="text-[#A89B80]">최종 업데이트: {date}</span>
          </>
        )}
      </div>
    </div>
  );
}
