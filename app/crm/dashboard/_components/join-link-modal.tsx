"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "../../_components/crm-modal";
import { useCrmToast } from "../../_components/crm-toast";

interface JoinLink {
  token: string;
  code: string;
  url: string;
}

/**
 * 센터 연결 QR/링크 모달. /api/crm/join-link 로 센터 가입 링크를 발급받아
 * QR·링크·가입코드를 보여준다. 회원이 스캔·입력하면 이 센터로 가입 연결.
 */
export function JoinLinkModal({ mode, onClose }: { mode: "qr" | "link"; onClose: () => void }) {
  const { getIdToken } = useAuth();
  const toast = useCrmToast();
  const [data, setData] = useState<JoinLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/join-link", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 403) {
        setError("센터 관리자(대표자/관리자)만 발급할 수 있어요.");
        return;
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "불러오기 실패");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const regenerate = async () => {
    if (!window.confirm("기존 QR·링크가 무효화되고 새로 발급됩니다. 계속할까요?")) return;
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/join-link", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "재발급 실패");
      setData(d);
      toast.show("재발급 완료");
    } catch (e) {
      setError(e instanceof Error ? e.message : "재발급 실패");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${label} 복사됨`);
    } catch {
      /* ignore */
    }
  };

  const downloadQr = () => {
    const canvas = qrWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `센터연결QR_${data?.code ?? ""}.png`;
    a.click();
  };

  return (
    <CrmModal open onClose={onClose} title={mode === "qr" ? "센터 연결 QR" : "센터 연결 링크"} size="sm">
      {loading ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : error ? (
        <div className="py-8 text-center text-[13px] text-[#8C8270]">{error}</div>
      ) : data ? (
        <div className="space-y-4">
          <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
            회원이 이 <b>{mode === "qr" ? "QR" : "링크"}</b>로 접속해 <b>회원용 앱</b>을 설치·실행하면
            <b> 이 센터로 회원가입</b>이 연결돼요.
          </p>

          {/* QR */}
          <div ref={qrWrapRef} className="flex flex-col items-center gap-2">
            <div className="p-3 rounded-2xl bg-white border border-[#E8E0D0] shadow-sm">
              <QRCodeCanvas value={data.url} size={mode === "qr" ? 200 : 140} level="M" includeMargin={false} />
            </div>
            <button
              type="button"
              onClick={downloadQr}
              className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              QR 이미지 저장
            </button>
          </div>

          {/* 링크 */}
          <div>
            <div className="text-[11.5px] font-medium text-[#8C8270] dark:text-zinc-500 mb-1">연결 링크</div>
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={data.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/60 dark:bg-zinc-900 text-[12.5px] text-[#3A342A] dark:text-zinc-200"
              />
              <button
                type="button"
                onClick={() => copy(data.url, "링크")}
                className="shrink-0 px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[12px] font-semibold hover:bg-[#5a6932]"
              >
                복사
              </button>
            </div>
          </div>

          {/* 가입 코드 */}
          <div>
            <div className="text-[11.5px] font-medium text-[#8C8270] dark:text-zinc-500 mb-1">
              가입 코드 <span className="text-[#A89B80]">(앱에서 직접 입력용)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/60 dark:bg-zinc-900 text-[15px] font-bold tracking-[0.2em] text-[#2A251D] dark:text-zinc-100 text-center">
                {data.code}
              </div>
              <button
                type="button"
                onClick={() => copy(data.code, "코드")}
                className="shrink-0 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              >
                복사
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="text-[12px] font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {busy ? "재발급 중…" : "링크 재발급"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </CrmModal>
  );
}
