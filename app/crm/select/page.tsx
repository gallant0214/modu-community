"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { setCenterCookie } from "../_components/crm-center-cookie";
import { EMPLOYMENT_TYPE_LABEL } from "../_components/crm-labels";

interface CenterCtx {
  centerMemberId: number;
  centerId: number;
  centerName: string;
  centerKind: "solo" | "center";
  region: string | null;
  role: "owner" | "admin" | "manager" | "trainer";
  employmentType: string | null;
  gradeLabel: string | null;
  isSoloOwner: boolean;
  status: "active" | "pending";
  accessAllowed: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "대표자",
  admin: "관리자",
  manager: "팀장",
  trainer: "강사",
};

export default function CrmSelectPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [list, setList] = useState<CenterCtx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/centers/mine", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.centers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const [creating, setCreating] = useState(false);

  const enter = (centerId: number) => {
    setCenterCookie(centerId);
    router.replace("/crm/dashboard");
  };

  // 개인(solo) CRM 생성 후 바로 진입. 이미 있으면 그걸 반환받아 진입.
  const createSolo = async () => {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/bootstrap", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ mode: "solo" }),
      });
      const data = await res.json();
      if (!res.ok || !data.centerId) throw new Error(data?.error || "개인 CRM 생성 실패");
      enter(data.centerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setCreating(false);
    }
  };

  const personal = list.find((c) => c.isSoloOwner || c.centerKind === "solo");
  const centers = list.filter((c) => !(c.isSoloOwner || c.centerKind === "solo"));

  return (
    <div className="max-w-xl mx-auto px-5 py-8 md:py-12">
      <div className="mb-6">
        <p className="text-[11.5px] font-semibold tracking-wide text-[#8C8270] dark:text-zinc-500">
          MODU CM CRM
        </p>
        <h1 className="mt-1 text-[22px] font-bold text-[#241F18] dark:text-zinc-100">
          어디로 접속할까요?
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          개인 CRM 또는 등록된 센터를 선택해 주세요.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-5">
          {/* 개인 CRM */}
          <section>
            <div className="mb-1.5 text-[12px] font-semibold text-[#8C8270] dark:text-zinc-500">
              개인 CRM
            </div>
            {personal ? (
              <ContextCard
                title={personal.centerName || "개인 CRM"}
                badge="개인"
                sub="나 혼자 사용하는 개인용 CRM"
                onClick={() => enter(personal.centerId)}
              />
            ) : (
              <ContextCard
                title={creating ? "개인 CRM 만드는 중…" : "개인 CRM 만들기"}
                sub="아직 개인 CRM이 없어요. 나 혼자 쓰는 CRM을 바로 만들 수 있어요."
                onClick={createSolo}
                disabled={creating}
              />
            )}
          </section>

          {/* 등록된 센터 */}
          {centers.length > 0 && (
            <section>
              <div className="mb-1.5 text-[12px] font-semibold text-[#8C8270] dark:text-zinc-500">
                등록된 센터
              </div>
              <div className="space-y-2.5">
                {centers.map((c) => {
                  const blocked =
                    !c.accessAllowed && c.status === "active"
                      ? "접근 권한 없음"
                      : c.status === "pending"
                        ? "승인 대기 중"
                        : null;
                  return (
                    <ContextCard
                      key={c.centerMemberId}
                      title={c.centerName || "센터"}
                      badge={
                        (c.employmentType ? EMPLOYMENT_TYPE_LABEL[c.employmentType] : "") ||
                        c.gradeLabel ||
                        ROLE_LABEL[c.role] ||
                        c.role
                      }
                      sub={c.region ?? undefined}
                      disabled={!!blocked}
                      disabledLabel={blocked ?? undefined}
                      onClick={() => enter(c.centerId)}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* 센터 가입 */}
          <button
            type="button"
            onClick={() => router.replace("/crm/onboarding")}
            className="w-full rounded-xl border border-dashed border-[#E8E0D0] dark:border-zinc-700 px-4 py-3 text-[13px] font-medium text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60 transition-colors"
          >
            + 다른 센터 검색·가입 / 새 센터 등록
          </button>
        </div>
      )}
    </div>
  );
}

function ContextCard({
  title,
  badge,
  sub,
  onClick,
  disabled,
  disabledLabel,
}: {
  title: string;
  badge?: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group w-full text-left rounded-xl border px-4 py-3.5 transition-all
        ${disabled
          ? "border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/50 dark:bg-zinc-900/50 opacity-70 cursor-not-allowed"
          : "border-[#E4D9C6] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A] hover:bg-[#F5F0E5]/50 dark:hover:bg-zinc-800/60 cursor-pointer"
        }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-[#241F18] dark:text-zinc-100 truncate">
          {title}
        </span>
        {badge && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#EFF5E2] text-[#4D622C] border border-[#DDE8C5] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A] dark:border-transparent">
            {badge}
          </span>
        )}
        {disabledLabel && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500">
            {disabledLabel}
          </span>
        )}
        {!disabled && (
          <svg
            className="ml-auto w-4 h-4 text-[#A89B80] group-hover:text-[#6B7B3A]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
      {sub && (
        <div className="mt-0.5 text-[12.5px] text-[#8C8270] dark:text-zinc-500 truncate">{sub}</div>
      )}
    </button>
  );
}
