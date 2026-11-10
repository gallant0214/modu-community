"use client";

import { MESSAGE_VARIABLES } from "@/app/lib/auto-message-triggers";

export interface VarDef {
  token: string;
  desc: string;
  example: string;
  sample: string;
}

/**
 * 변수 버튼 말풍선 — 같은 문구가 발송되면 어떻게 바뀌는지 위/아래로 나란히 보여준다.
 * 모달 안쪽은 스크롤·overflow-hidden 이라 fixed 로 띄운다(잘림 방지).
 * 자동 메세지 07 '메세지 입력'과 쿠폰 발송 '안내 문구'가 같이 쓴다.
 */
export function VarHintBubble({
  token,
  left,
  top,
  above,
  sample,
  vars = MESSAGE_VARIABLES,
}: {
  token: string;
  left: number;
  top: number;
  above: boolean;
  sample: string;
  /** 변수 설명 목록 — 기본은 자동 메세지 변수. 화면 전용 변수가 있으면 더해서 넘긴다 */
  vars?: VarDef[];
}) {
  const v = vars.find((x) => x.token === token);
  if (!v) return null;
  const received = v.example.replaceAll(token, sample);
  return (
    <div
      role="tooltip"
      style={{ left, top, transform: above ? "translateY(-100%)" : undefined }}
      className="pointer-events-none fixed z-[60] w-[300px] max-w-[calc(100vw-1.25rem)] rounded-xl bg-[#4A4640] px-3.5 py-3 text-left shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5)]"
    >
      <div className="text-[12px] font-bold text-white">{v.token}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-white/70">{v.desc}</div>
      <div className="mt-2.5 space-y-1.5 border-t border-white/15 pt-2.5">
        <div>
          <div className="text-[10px] font-semibold text-white/50">내가 쓴 문구</div>
          <div className="text-[12px] leading-relaxed text-white/85 break-words">{v.example}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#C7D68A]">회원이 받는 메세지</div>
          <div className="text-[12.5px] font-semibold leading-relaxed text-white break-words">
            {received}
          </div>
        </div>
      </div>
    </div>
  );
}
