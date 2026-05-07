import Link from "next/link";

export const metadata = {
  title: "거래 안전 안내 — 사기 피해 예방",
  description: "거래 게시판 사기 피해 예방 가이드 및 면책 조항.",
};

export default function TradeSafetyPage() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-4 pb-5 space-y-4">
        {/* 상단 바 */}
        <div className="flex items-center gap-2">
          <Link href="/trade" className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors flex-1">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">거래 게시판</span>
          </Link>
        </div>

        {/* 제목 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#C0392B]/40 rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[24px]">⚠️</span>
            <h1 className="text-[20px] sm:text-[22px] font-bold text-[#C0392B] tracking-tight">
              거래 안전 안내
            </h1>
          </div>
          <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
            거래 게시판은 사용자 간 직접 거래를 중개합니다. 사기 피해를 줄이기 위해 아래 내용을 반드시 확인해 주세요.
          </p>
        </section>

        {/* 사기 피해 유형 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
            🚨 자주 발생하는 사기 유형
          </h2>
          <ul className="space-y-2.5 text-[13px] text-[#3A342A] dark:text-zinc-200 leading-relaxed">
            <li>• <strong>선입금 후 잠적</strong> — 입금하면 빨리 보내준다며 입금 유도 후 연락 두절</li>
            <li>• <strong>가짜 매물</strong> — 다른 곳의 사진을 도용해 실물 없이 판매하는 척</li>
            <li>• <strong>추가 결제 유도</strong> — 배송비·계약금·수수료 등 핑계로 반복 입금 요구</li>
            <li>• <strong>가짜 안전결제 사이트</strong> — 진짜와 비슷한 가짜 결제 페이지 링크 전송</li>
            <li>• <strong>해킹된 계정</strong> — 평소엔 정상이던 계정이 해킹되어 갑자기 거래 제안</li>
          </ul>
        </section>

        {/* 피해 예방 방법 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
            ✅ 피해를 막는 7가지 수칙
          </h2>
          <ol className="space-y-3 text-[13px] text-[#3A342A] dark:text-zinc-200 leading-relaxed">
            <li>
              <strong className="text-[#6B7B3A]">1. 직거래 우선</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">실물을 직접 보고 결제하는 것이 가장 안전합니다. 운동기구는 부피가 크니 용달 약속 전에도 영상 통화로 작동 확인을 요청하세요.</p>
            </li>
            <li>
              <strong className="text-[#6B7B3A]">2. 안전결제 사용</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">택배 거래는 카카오페이·네이버페이 안전결제(에스크로) 등 본인이 신뢰하는 결제 수단을 이용하세요. 판매자가 안전결제를 거부한다면 의심하세요.</p>
            </li>
            <li>
              <strong className="text-[#6B7B3A]">3. 계좌·번호 사기 조회</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">입금 전 <a href="https://thecheat.co.kr" target="_blank" rel="noopener noreferrer" className="text-[#C0392B] underline">더치트(thecheat.co.kr)</a> 또는 경찰청 <a href="https://ecrm.police.go.kr" target="_blank" rel="noopener noreferrer" className="text-[#C0392B] underline">사이버범죄 신고시스템(ECRM)</a> 에서 상대방 계좌·전화번호의 사기 이력을 확인하세요.</p>
            </li>
            <li>
              <strong className="text-[#6B7B3A]">4. 사진 역검색</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">매물 사진을 구글·네이버 이미지 검색으로 역검색해 다른 곳에서 도용된 사진은 아닌지 확인하세요. 같은 사진이 여러 사이트에 있으면 사기일 가능성이 높습니다.</p>
            </li>
            <li>
              <strong className="text-[#6B7B3A]">5. 개인정보 노출 금지</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">주민등록번호, 신분증 사본, 비밀번호, OTP 번호 등은 어떤 이유로도 거래 상대방에게 보내지 마세요. 정상 거래에서 요구할 일이 없습니다.</p>
            </li>
            <li>
              <strong className="text-[#6B7B3A]">6. 비정상 계좌·재촉 의심</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">"오늘 안에 입금해야 보내준다", "법인 명의 통장으로 입금해라" 같은 재촉이나 명의 불일치 계좌는 사기 패턴입니다.</p>
            </li>
            <li>
              <strong className="text-[#6B7B3A]">7. 만남 장소·시간</strong>
              <p className="mt-1 text-[#6B5D47] dark:text-zinc-400">직거래는 사람 많은 공공장소(편의점·지하철역·공원)에서 낮 시간대에 약속하세요. 한적한 곳·심야는 피해 주세요.</p>
            </li>
          </ol>
        </section>

        {/* 신고 방법 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
            📢 사기 의심·피해 신고
          </h2>
          <ul className="space-y-2.5 text-[13px] text-[#3A342A] dark:text-zinc-200 leading-relaxed">
            <li>• <strong>게시글 신고</strong>: 거래 게시글의 신고 버튼 사용</li>
            <li>• <strong>경찰청 사이버수사대</strong>: <a href="https://ecrm.police.go.kr" target="_blank" rel="noopener noreferrer" className="text-[#C0392B] underline">ecrm.police.go.kr</a> 또는 ☎ 182</li>
            <li>• <strong>더치트</strong>: <a href="https://thecheat.co.kr" target="_blank" rel="noopener noreferrer" className="text-[#C0392B] underline">thecheat.co.kr</a> — 사기 계좌·전화번호 등록 및 조회</li>
            <li>• <strong>금융감독원</strong>: 보이스피싱·금융사기 ☎ 1332</li>
          </ul>
        </section>

        {/* 면책 조항 */}
        <section className="bg-[#FFF4E5] dark:bg-zinc-800/60 border border-[#F5D9B0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          <h2 className="text-[15px] font-bold text-[#C0392B] mb-3">
            ⚖️ 면책 조항
          </h2>
          <div className="space-y-3 text-[13px] text-[#3A342A] dark:text-zinc-200 leading-relaxed">
            <p>
              <strong>모두의 지도사 커뮤니티는 거래 당사자가 아닙니다.</strong> 본 거래 게시판은 회원 간 정보 공유 및 직접 거래를 위한 공간으로, 운영자(모두의 지도사)는 거래 과정에 일체 관여하지 않습니다.
            </p>
            <p>
              거래 과정에서 발생하는 <strong className="text-[#C0392B]">모든 분쟁·사기·금전적 피해·물품 하자·배송 사고</strong>에 대해 모두의 지도사 커뮤니티는 어떠한 책임도 지지 않으며, 모든 거래는 사용자 본인의 판단과 책임 하에 이루어집니다.
            </p>
            <p>
              사기 피해 발생 시 즉시 위 신고 방법을 참고하여 수사기관에 신고해 주시기 바라며, 본 게시판에서 발생한 사기 게시물은 신고 시 신속히 삭제·조치하지만 이미 발생한 피해를 회복해드릴 수는 없습니다.
            </p>
          </div>
        </section>

        <p className="text-center text-[12px] text-[#8C8270] dark:text-zinc-500 py-2">
          안전한 거래 문화를 위해 협조해 주세요. 🙏
        </p>
      </div>
    </div>
  );
}
