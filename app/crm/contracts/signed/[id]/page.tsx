"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { formatWon } from "../../../_components/crm-labels";
import { contractBodyHtml } from "@/app/lib/contract-body";

interface TermSnapshot {
  key: string;
  title: string;
  body: string;
  required: boolean;
}

interface CustomerInfo {
  name?: string;
  phone?: string;
  birth?: string | null;
  gender?: string;
  address?: string;
  exercise_purpose?: string;
  visit_route?: string;
  consultant?: string;
}

interface ProductInfo {
  lesson_kind?: string;
  total_sessions?: number;
  session_minutes?: number;
  issued_at?: string;
  expires_at?: string;
}

interface PaymentInfo {
  price_won?: number;
  payment_method?: string;
  payment_method_custom?: string | null;
}

interface SignedContract {
  id: number;
  title: string;
  signed_at: string;
  customer_info: CustomerInfo;
  product_info: ProductInfo | null;
  payment_info: PaymentInfo | null;
  terms_accepted: Record<string, boolean>;
  terms_snapshot: TermSnapshot[];
  signature_data_url: string | null;
  trainer_signature_data_url: string | null;
  trainer_info: { center_member_id?: number | null; name?: string | null } | null;
  status: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "현금",
  card: "카드",
  transfer: "계좌이체",
  etc: "기타",
};

export default function SignedContractDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { getIdToken } = useAuth();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/crm/settings?tab=contracts");
  };

  const [contract, setContract] = useState<SignedContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch(`/api/crm/contracts/sign/${id}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setContract(data.contract);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, getIdToken]);

  const remove = async () => {
    if (!window.confirm("이 계약서를 무효화할까요? 목록에서 숨겨집니다.")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/contracts/sign/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) goBack();
  };

  if (loading) {
    return <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }
  if (!contract) {
    return (
      <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
        <div className="text-[13px] text-red-700">{error || "계약서를 찾을 수 없습니다"}</div>
        <button onClick={goBack} className="mt-3 inline-block text-[13px] text-[#6B7B3A] underline">
          ← 계약서 목록
        </button>
      </div>
    );
  }

  const c = contract.customer_info;
  const p = contract.product_info;
  const pay = contract.payment_info;
  const signedYmd = new Date(contract.signed_at);
  const dateStr = `${signedYmd.getFullYear()}년 ${String(signedYmd.getMonth() + 1).padStart(2, "0")}월 ${String(signedYmd.getDate()).padStart(2, "0")}일`;

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <button onClick={goBack} className="text-[13px] text-[#6B5D47] hover:text-[#3A342A]">
          ← 계약서 목록
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
          >
            인쇄 / PDF 저장
          </button>
          <button
            onClick={remove}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-[12.5px] font-medium hover:bg-red-50"
          >
            무효화
          </button>
        </div>
      </div>

      <article id="contract-print" className="space-y-5">
        <header className="text-center">
          <h1 className="text-[22px] font-bold text-[#2A251D]">{contract.title}</h1>
          {contract.status === "voided" && (
            <div className="mt-1 inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700">
              무효 처리됨
            </div>
          )}
        </header>

        <Section title="고객 기본 정보">
          <KvTable
            rows={[
              ["이름", c.name || "-"],
              ["연락처", c.phone || "-"],
              ["생년월일", c.birth || "-"],
              ["성별", c.gender || "-"],
              ["주소", c.address || "-"],
              ["운동목적", c.exercise_purpose || "-"],
              ["방문경로", c.visit_route || "-"],
              ["상담 담당자", c.consultant || "-"],
            ]}
          />
        </Section>

        {p && (
          <Section title="구매 상품 정보">
            <KvTable
              rows={[
                ["상품", p.lesson_kind || "-"],
                ["총 세션", p.total_sessions ? `${p.total_sessions}회` : "-"],
                ["세션 시간", p.session_minutes ? `${p.session_minutes}분` : "-"],
                ["기간", p.issued_at && p.expires_at ? `${p.issued_at} ~ ${p.expires_at}` : "-"],
              ]}
            />
          </Section>
        )}

        {pay && (
          <Section title="결제 정보">
            <KvTable
              rows={[
                ["결제 금액", pay.price_won !== undefined ? `${formatWon(pay.price_won)}원` : "-"],
                [
                  "결제 수단",
                  pay.payment_method === "etc"
                    ? pay.payment_method_custom || "기타"
                    : PAYMENT_LABEL[pay.payment_method ?? ""] || pay.payment_method || "-",
                ],
              ]}
            />
          </Section>
        )}

        {contract.terms_snapshot.map((t) => (
          <Section key={t.key} title={`[${t.title}]`}>
            <div
              className="prose prose-sm max-w-none text-[12.5px] leading-relaxed text-[#3A342A]"
              dangerouslySetInnerHTML={{ __html: contractBodyHtml(t.body) }}
            />
            <div
              className={`mt-3 text-[12.5px] font-semibold ${contract.terms_accepted?.[t.key]
                ? "text-[#6B7B3A]"
                : "text-[#A89B80]"
                }`}
            >
              ({t.required ? "필수" : "선택"}){" "}
              {contract.terms_accepted?.[t.key] ? "✓ 동의함" : "✗ 동의 안 함"}
            </div>
          </Section>
        ))}

        <Section title="서명">
          <div className="mb-3 text-[12.5px] text-[#6B5D47]">
            작성일: <span className="font-semibold text-[#2A251D]">{dateStr}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[12.5px] text-[#6B5D47] mb-1">
                계약 담당자{" "}
                <span className="text-[#3A342A] font-semibold">
                  {contract.trainer_info?.name || "—"}
                </span>
              </div>
              {contract.trainer_signature_data_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={contract.trainer_signature_data_url}
                  alt="계약 담당자 서명"
                  className="max-h-32 border border-[#E8E0D0] rounded-lg bg-white"
                />
              ) : (
                <div className="text-[12.5px] text-[#A89B80]">서명 없음</div>
              )}
            </div>
            <div>
              <div className="text-[12.5px] text-[#6B5D47] mb-1">
                가입 회원{" "}
                <span className="text-[#3A342A] font-semibold">
                  {contract.customer_info?.name || "—"}
                </span>
              </div>
              {contract.signature_data_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={contract.signature_data_url}
                  alt="가입 회원 서명"
                  className="max-h-32 border border-[#E8E0D0] rounded-lg bg-white"
                />
              ) : (
                <div className="text-[12.5px] text-[#A89B80]">서명 없음</div>
              )}
            </div>
          </div>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-4 rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7]">
      <h2 className="text-[14px] font-semibold text-[#2A251D] mb-3">{title}</h2>
      {children}
    </section>
  );
}

function KvTable({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[#A89B80]">{k}</dt>
          <dd className="text-[#2A251D] font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
