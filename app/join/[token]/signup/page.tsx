"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

/* 신규 회원 웹 가입 (토스 스타일) — QR/가입링크 → '신규 회원 가입하기' 로 진입.
   단계: 정보입력 → 헬스이용권 → 운동복 → 락커 → 요약 → (다음 단계: 전자계약서·셀카·결제·앱연동 — 준비 중)
   한 화면 한 질문 · 큰 제목 · 하단 CTA · 슬라이드 전환. */

interface ProductOpt {
  id: number;
  name: string;
  price_won: number;
  vat_included: boolean;
  duration_value: number;
  duration_unit: string;
}
interface SignupProducts {
  centerId: number;
  centerName: string;
  memberships: ProductOpt[];
  apparel: ProductOpt[];
  lockers: ProductOpt[];
}

type Step = "info" | "membership" | "apparel" | "locker" | "summary";
const ORDER: Step[] = ["info", "membership", "apparel", "locker", "summary"];

const won = (n: number) => n.toLocaleString("ko-KR");
const durLabel = (v: number, u: string) =>
  u === "month" ? `${v}개월` : u === "year" ? `${v}년` : `${v}일`;

export default function MemberWebSignupPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();

  const [data, setData] = useState<SignupProducts | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("info");
  const [dir, setDir] = useState<1 | -1>(1); // 1=전진(오른쪽에서) -1=뒤로(왼쪽에서)

  // 입력값
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  // 선택값
  const [membershipId, setMembershipId] = useState<number | null>(null);
  const [apparelId, setApparelId] = useState<number | null>(null); // null=선택 안 함
  const [lockerId, setLockerId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/join/signup-products?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || "불러오지 못했어요");
        setData(d);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const fmtPhone = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const go = useCallback((next: Step, d: 1 | -1) => {
    setDir(d);
    setStep(next);
  }, []);
  const idx = ORDER.indexOf(step);
  const back = () => {
    if (idx <= 0) {
      router.replace(`/join/${encodeURIComponent(token)}`);
      return;
    }
    go(ORDER[idx - 1], -1);
  };
  const next = () => {
    if (idx < ORDER.length - 1) go(ORDER[idx + 1], 1);
  };

  const canNext = useMemo(() => {
    if (step === "info")
      return (
        name.trim().length > 0 &&
        phone.replace(/\D/g, "").length >= 10 &&
        /^\d{4}-\d{2}-\d{2}$/.test(birth) &&
        !!gender
      );
    if (step === "membership") return membershipId != null;
    return true; // apparel/locker/summary 는 선택 안 함 허용
  }, [step, name, phone, birth, gender, membershipId]);

  const selMembership = data?.memberships.find((p) => p.id === membershipId) ?? null;
  const selApparel = data?.apparel.find((p) => p.id === apparelId) ?? null;
  const selLocker = data?.lockers.find((p) => p.id === lockerId) ?? null;
  const total =
    (selMembership?.price_won ?? 0) + (selApparel?.price_won ?? 0) + (selLocker?.price_won ?? 0);

  if (loading) {
    return <Shell><div className="py-20 text-center text-[13px] text-[#8C8270]">불러오는 중…</div></Shell>;
  }
  if (loadErr || !data) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <div className="text-[15px] font-bold text-[#2A251D] mb-1">가입 화면을 열 수 없어요</div>
          <div className="text-[12.5px] text-[#8C8270]">{loadErr || "잠시 후 다시 시도해 주세요."}</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 상단: 뒤로 + 진행 점 */}
      <div className="flex items-center gap-3 px-1 pt-2 pb-4">
        <button onClick={back} aria-label="뒤로" className="p-1 -ml-1 text-[#3A342A]">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 flex items-center gap-1.5">
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= idx ? "bg-[#6B7B3A]" : "bg-[#E8E0D0]"}`}
            />
          ))}
        </div>
      </div>

      <div key={step} className={dir === 1 ? "tw-slide-r" : "tw-slide-l"}>
        {step === "info" && (
          <StepBody title="회원 정보를 입력해 주세요" sub={`${data.centerName}`}>
            <Field label="이름">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
            </Field>
            <Field label="휴대폰 번호">
              <input
                value={phone}
                onChange={(e) => setPhone(fmtPhone(e.target.value))}
                inputMode="numeric"
                placeholder="010-0000-0000"
                className={inputCls}
              />
            </Field>
            <Field label="생년월일">
              <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={inputCls} />
            </Field>
            <Field label="성별">
              <div className="grid grid-cols-2 gap-2">
                {([["male", "남성"], ["female", "여성"]] as const).map(([g, lb]) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`py-3 rounded-xl border text-[15px] font-semibold transition-colors ${
                      gender === g
                        ? "border-[#6B7B3A] bg-[#6B7B3A]/8 text-[#2A251D]"
                        : "border-[#E8E0D0] text-[#8C8270]"
                    }`}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            </Field>
          </StepBody>
        )}

        {step === "membership" && (
          <StepBody title="헬스 이용권을 선택해 주세요" sub="기간을 골라주세요">
            {data.memberships.length === 0 ? (
              <Empty text="등록된 이용권이 없어요. 센터에 문의해 주세요." />
            ) : (
              <OptionList
                options={data.memberships}
                selectedId={membershipId}
                onSelect={setMembershipId}
              />
            )}
          </StepBody>
        )}

        {step === "apparel" && (
          <StepBody title="운동복도 함께 하시겠어요?" sub="선택 안 해도 괜찮아요">
            <SkipCard active={apparelId === null} onClick={() => setApparelId(null)} />
            <OptionList options={data.apparel} selectedId={apparelId} onSelect={setApparelId} />
          </StepBody>
        )}

        {step === "locker" && (
          <StepBody title="락커를 추가하시겠어요?" sub="기간을 골라주세요 (선택)">
            <SkipCard active={lockerId === null} onClick={() => setLockerId(null)} />
            <OptionList options={data.lockers} selectedId={lockerId} onSelect={setLockerId} />
          </StepBody>
        )}

        {step === "summary" && (
          <StepBody title="신청 내용을 확인해 주세요" sub={data.centerName}>
            <div className="rounded-2xl border border-[#E8E0D0] bg-white divide-y divide-[#EFE7D5]">
              <SumRow label="이름" value={name} />
              <SumRow label="연락처" value={phone} />
              <SumRow label="헬스 이용권" value={selMembership ? `${selMembership.name} · ${won(selMembership.price_won)}원` : "—"} />
              <SumRow label="운동복" value={selApparel ? `${selApparel.name} · ${won(selApparel.price_won)}원` : "선택 안 함"} />
              <SumRow label="락커" value={selLocker ? `${selLocker.name} · ${won(selLocker.price_won)}원` : "선택 안 함"} />
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px] font-bold text-[#2A251D]">결제 예정 금액</span>
                <span className="text-[17px] font-extrabold text-[#6B7B3A]">{won(total)}원</span>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-[#FBF7EB] border border-[#EFE7D5] px-4 py-3 text-[12px] text-[#8C8270] leading-relaxed">
              다음 단계(전자계약서 서명 · 본인확인 촬영 · 결제)는 순차적으로 제공될 예정입니다.
            </div>
          </StepBody>
        )}
      </div>

      {/* 하단 CTA */}
      <div className="sticky bottom-0 bg-gradient-to-t from-[#FBF7EB] via-[#FBF7EB] to-transparent pt-4 pb-5">
        {step === "summary" ? (
          <button
            disabled
            className="w-full py-4 rounded-2xl bg-[#CFC6AE] text-white text-[16px] font-bold cursor-not-allowed"
          >
            전자계약서 작성하기 (준비 중)
          </button>
        ) : (
          <button
            onClick={next}
            disabled={!canNext}
            className="w-full py-4 rounded-2xl bg-[#6B7B3A] text-white text-[16px] font-bold transition-colors disabled:bg-[#CFC6AE] hover:bg-[#5a6932]"
          >
            다음
          </button>
        )}
      </div>

      <style>{`
        @keyframes twSlideR { from { transform: translateX(16px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes twSlideL { from { transform: translateX(-16px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        .tw-slide-r { animation: twSlideR .22s ease-out both }
        .tw-slide-l { animation: twSlideL .22s ease-out both }
      `}</style>
    </Shell>
  );
}

const inputCls =
  "w-full px-4 py-3.5 rounded-xl border border-[#E8E0D0] bg-white text-[16px] text-[#2A251D] focus:outline-none focus:border-[#6B7B3A]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#FBF7EB] flex justify-center">
      <div className="w-full max-w-[460px] px-5 flex flex-col">{children}</div>
    </div>
  );
}

function StepBody({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      {sub && <div className="text-[12.5px] font-semibold text-[#6B7B3A] mb-1">{sub}</div>}
      <h1 className="text-[22px] font-extrabold text-[#2A251D] leading-snug mb-5">{title}</h1>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12.5px] font-semibold text-[#6B5D47] mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function OptionList({
  options,
  selectedId,
  onSelect,
}: {
  options: ProductOpt[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((p) => {
        const on = selectedId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full flex items-center justify-between gap-2 px-4 py-4 rounded-2xl border text-left transition-colors ${
              on ? "border-[#6B7B3A] bg-[#6B7B3A]/8" : "border-[#E8E0D0] bg-white"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#2A251D] truncate">{p.name}</span>
              <span className="block text-[12px] text-[#8C8270]">{durLabel(p.duration_value, p.duration_unit)}</span>
            </span>
            <span className="shrink-0 text-[15px] font-extrabold text-[#6B7B3A]">{won(p.price_won)}원</span>
          </button>
        );
      })}
    </div>
  );
}

function SkipCard({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3.5 rounded-2xl border text-[14px] font-semibold transition-colors ${
        active ? "border-[#6B7B3A] bg-[#6B7B3A]/8 text-[#2A251D]" : "border-[#E8E0D0] bg-white text-[#8C8270]"
      }`}
    >
      선택 안 함
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-[13px] text-[#A89B80]">{text}</div>;
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[13px] text-[#8C8270]">{label}</span>
      <span className="text-[13.5px] font-semibold text-[#2A251D] text-right">{value}</span>
    </div>
  );
}
