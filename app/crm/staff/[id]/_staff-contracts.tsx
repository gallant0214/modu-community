"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

interface SignedRow {
  id: number;
  title: string;
  status: string;
  signed_at: string | null;
  requested_at: string | null;
  created_at: string;
}
interface TemplateRow {
  id: number;
  title: string;
}

/**
 * 직원(근로) 전자계약서 섹션 — 직원 상세 페이지.
 * staff_contracts.view 있어야 보이고, staff_contracts.edit 있어야 작성 가능.
 * 서명은 회원권 전자계약서와 동일 흐름(/crm/contracts/sign/new)을 재사용.
 */
export function StaffContractsSection({ staffMemberId }: { staffMemberId: number }) {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const [canView, setCanView] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [list, setList] = useState<SignedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const h = { authorization: `Bearer ${token}` };
      const [bRes, cRes] = await Promise.all([
        fetch("/api/crm/bootstrap", { headers: h, cache: "no-store" }),
        fetch(`/api/crm/contracts/sign?staff_member_id=${staffMemberId}`, { headers: h, cache: "no-store" }),
      ]);
      if (bRes.ok) {
        const b = await bRes.json();
        setCanView(!!b.permissions?.["staff_contracts.view"]);
        setCanEdit(!!b.permissions?.["staff_contracts.edit"]);
      }
      if (cRes.ok) setList((await cRes.json()).contracts ?? []);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, staffMemberId]);

  useEffect(() => {
    load();
  }, [load]);

  const openPicker = async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await fetch("/api/crm/contracts?category=employment", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) setTemplates((await res.json()).contracts ?? []);
    setPicking(true);
  };

  const go = (templateId: number) => {
    router.push(`/crm/contracts/sign/new?staff_member_id=${staffMemberId}&template_id=${templateId}`);
  };

  if (loading) return null;
  if (!canView) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          근로 전자계약서
        </h2>
        {canEdit && (
          <button
            onClick={openPicker}
            className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
          >
            + 작성하기
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          작성된 근로 전자계약서가 없어요.
          {canEdit && " 위 ‘작성하기’로 근로·아르바이트 계약서를 작성해 주세요."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {list.map((c) => {
            const pending = c.status === "pending_signature";
            return (
              <li key={c.id}>
                <Link
                  href={`/crm/contracts/signed/${c.id}`}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
                >
                  <span className="min-w-0 truncate text-[13.5px] font-medium text-[#2A251D] dark:text-zinc-100">
                    {c.title}
                  </span>
                  <span className={`shrink-0 text-[11.5px] ${pending ? "text-[#B47B2A]" : "text-[#8C8270]"}`}>
                    {pending
                      ? "서명 대기"
                      : c.signed_at
                        ? `서명 ${new Date(c.signed_at).toISOString().slice(0, 10)}`
                        : "완료"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPicking(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-[#FEFCF7] dark:bg-zinc-950 border border-[#E8E0D0] dark:border-zinc-800 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-1">
              계약서 양식 선택
            </div>
            <p className="text-[11.5px] text-[#8C8270] mb-3">
              직원(근로·아르바이트) 계약서 양식을 골라 주세요. 양식은 사이드바 ‘전자계약서’에서 관리해요.
            </p>
            {templates.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12.5px] text-[#8C8270]">
                등록된 근로 계약서 양식이 없어요.
                <br />
                사이드바 <b>전자계약서</b>에서 ‘근로/직원’ 분류로 먼저 양식을 만들어 주세요.
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => go(t.id)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 text-[13.5px] text-[#2A251D] dark:text-zinc-100"
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setPicking(false)}
              className="mt-3 w-full py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-300"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
