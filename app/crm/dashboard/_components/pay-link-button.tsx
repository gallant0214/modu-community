"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "../../_components/crm-modal";

/**
 * 결제링크 — 우리 센터 판매 페이지 주소를 꺼내 복사한다.
 *
 * 회원에게 보낼 링크라 주소를 손으로 옮겨 적다 틀리면 안 된다.
 * 센터별로 주소가 다르므로 하드코딩하지 않고 서버에서 받아온다.
 */
export function PayLinkButton() {
  const { getIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/shop-link", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { path?: string | null };
      setPath(data.path ?? null);
    } catch {
      /* 실패하면 버튼을 숨긴다 — 대시보드 자체에는 영향 없다 */
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !path) return null;

  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 막힌 환경 — 주소를 선택해 직접 복사하도록 알린다
      window.prompt("아래 주소를 복사해 주세요", url);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3B6BA5] bg-[#3B6BA5] text-white text-[12px] font-semibold hover:bg-[#32598A]"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 10.5a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1M10.5 13.5a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"
          />
        </svg>
        결제링크
      </button>

      <CrmModal open={open} onClose={() => setOpen(false)} title="결제링크" size="md">
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">
            회원에게 이 주소를 보내면 이용권을 바로 결제할 수 있어요.
            <br />
            문자·카카오톡·인스타 프로필 어디에 넣어도 됩니다.
          </p>

          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/60 dark:bg-zinc-900/60 p-3.5">
            <div className="break-all text-[13.5px] font-medium text-[#3B6BA5] dark:text-[#8FB4DE] tabular-nums">
              {url}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={copy}
                className={`px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-colors ${
                  copied
                    ? "bg-[#6B7B3A] text-white"
                    : "bg-[#3B6BA5] text-white hover:bg-[#32598A]"
                }`}
              >
                {copied ? "복사했어요" : "주소 복사"}
              </button>
              <a
                href={path}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold border border-[#D9CDB8] dark:border-zinc-700 text-[#3A342A] dark:text-zinc-200 hover:bg-[#F6F1E8] dark:hover:bg-zinc-800"
              >
                열어보기
              </a>
            </div>
          </div>

          <p className="text-[11.5px] leading-relaxed text-[#A89B80]">
            이 주소에는 <b>상품관리에서 &lsquo;온라인 판매중&rsquo;으로 켠 상품만</b> 올라갑니다.
            회원이 로그인하면 신규·재등록 조건에 맞는 가격이 자동으로 선택됩니다.
          </p>
        </div>
      </CrmModal>
    </>
  );
}
