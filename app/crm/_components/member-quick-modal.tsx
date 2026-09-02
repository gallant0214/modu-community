"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "./crm-modal";
import { formatPhone, formatWon } from "./crm-labels";

interface MemberDetail {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  birth: string | null;
  gender: "M" | "F" | "N" | null;
  memo: string | null;
  address: string | null;
  visit_route: string | null;
  workout_goal: string | null;
  counselor: string | null;
  mileage: number | null;
  registered_at: string | null;
  registration_type: string | null;
  first_use_at: string | null;
  total_paid_won: number | null;
  final_expire_at: string | null;
  last_attended_at: string | null;
  last_purchase_at: string | null;
  attendance_no: number | null;
  current_membership: string | null;
  current_pass: string | null;
  current_rental: string | null;
  current_locker: string | null;
  face_image_thumb: string | null;
}

interface Props {
  memberId: number | null;
  onClose: () => void;
}

/**
 * 회원 정보 요약 모달 — 락커 상세 등 다른 화면에서 회원 이름 클릭 시 잠깐 확인용.
 * 닫으면 뒤 화면(락커 상세 등) 그대로 유지되어 즉시 복귀.
 * 전체 편집이 필요하면 하단 "회원 상세 페이지로" 링크로 이동.
 */
export function MemberQuickModal({ memberId, onClose }: Props) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!memberId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch(`/api/crm/members/${memberId}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "조회 실패");
        if (!cancelled) setData(json.member as MemberDetail);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, getIdToken]);

  if (!memberId) return null;

  return (
    <CrmModal
      open
      onClose={onClose}
      title={data?.name ? `${data.name} 님` : "회원 정보"}
      size="md"
    >
      {loading ? (
        <div className="py-6 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : error ? (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-3">
          {/* 얼굴 + 이름 (누군지 바로 알아보기 위함 — 얼굴을 이름보다 크게) */}
          <div className="flex items-center gap-3.5">
            <div className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
              {data.face_image_thumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={data.face_image_thumb} alt={`${data.name} 얼굴`} className="w-full h-full object-cover" />
              ) : (
                <svg className="w-10 h-10 text-[#C9BEA6] dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[18px] font-bold text-[#2A251D] dark:text-zinc-100 truncate">
                {data.name} 님
              </div>
              <div className="mt-0.5 text-[12.5px] text-[#8C8270] dark:text-zinc-400">
                {data.gender === "M" ? "남성" : data.gender === "F" ? "여성" : ""}
                {data.birth ? `${data.gender ? " · " : ""}${data.birth}` : ""}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="연락처">{data.phone ? formatPhone(data.phone) : "—"}</Field>
            <Field label="성별">
              {data.gender === "M" ? "남성" : data.gender === "F" ? "여성" : data.gender === "N" ? "기타" : "—"}
            </Field>
            <Field label="생년월일">{data.birth || "—"}</Field>
            <Field label="주소">{data.address || "—"}</Field>
            <Field label="등록일">{data.registered_at || "—"}</Field>
            <Field label="등록 유형">
              {data.registration_type ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    data.registration_type === "재등록"
                      ? "bg-[#B47B2A] text-white border-[#B47B2A]"
                      : "bg-emerald-500 text-white border-emerald-500"
                  }`}
                >
                  {data.registration_type}
                </span>
              ) : (
                "—"
              )}
            </Field>
            <Field label="최종 만료일">{data.final_expire_at || "—"}</Field>
            <Field label="최근 방문">{data.last_attended_at || "—"}</Field>
            <Field label="누적 결제">{data.total_paid_won ? `${formatWon(data.total_paid_won)}원` : "—"}</Field>
            <Field label="출석 번호">{data.attendance_no ?? "—"}</Field>
          </div>

          {(data.current_membership || data.current_pass || data.current_rental || data.current_locker) && (
            <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 px-3 py-2">
              <div className="text-[11.5px] font-semibold text-[#3A342A] dark:text-zinc-200 mb-1">
                현재 보유
              </div>
              <div className="grid grid-cols-1 gap-0.5 text-[12.5px] text-[#3A342A] dark:text-zinc-200">
                {data.current_membership && <div>• 회원권: {data.current_membership}</div>}
                {data.current_pass && <div>• 수강권: {data.current_pass}</div>}
                {data.current_rental && <div>• 대여권: {data.current_rental}</div>}
                {data.current_locker && <div>• 락커: {data.current_locker}</div>}
              </div>
            </div>
          )}

          {data.memo && (
            <div>
              <div className="text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-400 mb-1">
                메모
              </div>
              <div className="text-[12.5px] text-[#3A342A] dark:text-zinc-200 whitespace-pre-wrap border border-[#E8E0D0] dark:border-zinc-800 rounded-lg px-3 py-2 bg-[#FEFCF7] dark:bg-zinc-900">
                {data.memo}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[#E8E0D0] dark:border-zinc-800">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-medium text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              닫기
            </button>
            <Link
              href={`/crm/members/${data.id}`}
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
            >
              회원 상세 페이지로 →
            </Link>
          </div>
        </div>
      ) : null}
    </CrmModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-[#8C8270] dark:text-zinc-500 mb-0.5">{label}</div>
      <div className="text-[13.5px] font-medium text-[#2A251D] dark:text-zinc-100">{children}</div>
    </div>
  );
}
