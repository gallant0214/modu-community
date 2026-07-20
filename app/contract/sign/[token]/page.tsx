"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { contractBodyHtml } from "@/app/lib/contract-body";

interface TermsSection {
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
  plan_name?: string;
  duration_days?: number;
  start_date?: string;
}

interface PaymentInfo {
  price_won?: number;
  payment_method?: string;
  payment_method_custom?: string | null;
}

interface Contract {
  id: number;
  title: string;
  status: string;
  customer_info: CustomerInfo;
  product_info: ProductInfo | null;
  payment_info: PaymentInfo | null;
  terms_snapshot: TermsSection[];
  terms_accepted: Record<string, boolean>;
  signed_at: string | null;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "현금",
  card: "카드",
  transfer: "계좌이체",
  etc: "기타",
};

const fmt = (n: number | undefined) =>
  n === undefined ? "" : n.toLocaleString("ko-KR");

export default function ContractSignPublicPage() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [exercisePurpose, setExercisePurpose] = useState("");
  const [visitRoute, setVisitRoute] = useState("");

  const [agreed, setAgreed] = useState<Record<string, boolean>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(
      d.getDate()
    ).padStart(2, "0")}일`;
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/contract/sign/${token}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "불러오지 못했어요");
        setContract(data.contract);
        const c = data.contract.customer_info ?? {};
        setName(c.name ?? "");
        setPhone(c.phone ?? "");
        setBirth(c.birth ?? "");
        setGender(c.gender ?? "");
        setAddress(c.address ?? "");
        setExercisePurpose(c.exercise_purpose ?? "");
        setVisitRoute(c.visit_route ?? "");
        if (data.contract.status === "signed") setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!contract || done) return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2A251D";
  }, [contract, done]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setSignatureEmpty(false);
  };
  const end = () => {
    drawingRef.current = false;
  };
  const clearSig = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setSignatureEmpty(true);
  };

  const toggleAgree = (k: string) =>
    setAgreed((prev) => ({ ...prev, [k]: !prev[k] }));

  const sections = contract?.terms_snapshot ?? [];
  const hasTermsContent = sections.length > 0 && sections.some((s) => (s?.body ?? "").trim().length > 0);
  const requiredSections = sections.filter((s) => s?.required);
  const requiredOk =
    requiredSections.length > 0 && requiredSections.every((s) => agreed[s.key]);

  const submit = async () => {
    setSubmitError("");
    if (!hasTermsContent) {
      return setSubmitError(
        "계약서 본문이 비어 있어요. 센터에 다시 링크를 요청해 주세요."
      );
    }
    if (requiredSections.length === 0) {
      return setSubmitError("필수 약관이 없어요. 센터에 문의해 주세요.");
    }
    if (!name.trim()) return setSubmitError("이름을 입력해 주세요");
    if (!requiredOk) return setSubmitError("필수 약관에 모두 동의해 주세요");
    if (signatureEmpty) return setSubmitError("서명을 입력해 주세요");

    setSubmitting(true);
    try {
      const dataUrl = canvasRef.current!.toDataURL("image/png");
      const res = await fetch(`/api/contract/sign/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_info: {
            name: name.trim(),
            phone: phone.trim(),
            birth: birth || null,
            gender,
            address: address.trim(),
            exercise_purpose: exercisePurpose.trim(),
            visit_route: visitRoute.trim(),
          },
          terms_accepted: agreed,
          signature_data_url: dataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4 text-[14px] text-[#8C8270]">
        불러오는 중…
      </div>
    );
  }
  if (error || !contract) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-[16px] font-semibold text-[#2A251D]">
            {error || "링크가 유효하지 않아요"}
          </div>
          <p className="mt-2 text-[13px] text-[#6B5D47]">
            센터에 연락해 다시 링크를 받아 주세요.
          </p>
        </div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-[#6B7B3A]/15 text-[#6B7B3A] flex items-center justify-center text-[22px] font-bold">
            ✓
          </div>
          <div className="text-[17px] font-bold text-[#2A251D]">
            서명이 완료되었어요
          </div>
          <p className="mt-2 text-[13px] text-[#6B5D47]">
            소중한 시간을 내주셔서 감사합니다.
          </p>
        </div>
      </div>
    );
  }

  const c = contract;
  const p = c.product_info;
  const pay = c.payment_info;

  return (
    <div className="min-h-dvh bg-[#FEFCF7] text-[#2A251D]">
      <div className="px-5 md:px-8 pt-5 pb-10 max-w-2xl mx-auto space-y-5">
        <header>
          <h1 className="text-[20px] md:text-[22px] font-bold">{c.title}</h1>
          <p className="mt-1 text-[13px] text-[#6B5D47]">
            아래 계약서 내용을 반드시 읽고, 필수 약관에 모두 동의한 뒤 서명해 주세요.
          </p>
        </header>

        {!hasTermsContent && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-[13px] text-red-700">
            이 링크는 계약서 본문이 비어 있어요. 서명이 불가능하니 센터에 다시
            링크를 요청해 주세요.
          </div>
        )}

        <Section title="고객 기본 정보">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="이름">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={30} />
            </Field>
            <Field label="연락처">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="생년월일">
              <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={inputCls} />
            </Field>
            <Field label="성별">
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
                <option value="">선택</option>
                <option value="남">남</option>
                <option value="여">여</option>
                <option value="기타">기타</option>
              </select>
            </Field>
            <Field label="주소" full>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} maxLength={120} />
            </Field>
            <Field label="운동목적">
              <input value={exercisePurpose} onChange={(e) => setExercisePurpose(e.target.value)} className={inputCls} maxLength={80} />
            </Field>
            <Field label="방문경로">
              <input value={visitRoute} onChange={(e) => setVisitRoute(e.target.value)} className={inputCls} maxLength={80} />
            </Field>
          </div>
        </Section>

        {p && Object.keys(p).length > 0 && (
          <Section title="구매 상품 정보">
            <KvList
              rows={[
                p.lesson_kind ? ["상품", p.lesson_kind] : null,
                p.total_sessions
                  ? ["세션", `${p.total_sessions}회 · ${p.session_minutes ?? 0}분`]
                  : null,
                p.plan_name ? ["플랜", p.plan_name] : null,
                p.duration_days ? ["기간", `${p.duration_days}일`] : null,
                p.issued_at && p.expires_at
                  ? ["발급 ~ 만료", `${p.issued_at} ~ ${p.expires_at}`]
                  : null,
                p.start_date && p.expires_at
                  ? ["시작 ~ 만료", `${p.start_date} ~ ${p.expires_at}`]
                  : null,
              ].filter(Boolean) as [string, string][]}
            />
          </Section>
        )}

        {pay && Object.keys(pay).length > 0 && (
          <Section title="결제 정보">
            <KvList
              rows={[
                pay.price_won !== undefined
                  ? (["결제 금액", `${fmt(pay.price_won)}원`] as [string, string])
                  : null,
                pay.payment_method
                  ? ([
                      "결제 수단",
                      pay.payment_method === "etc"
                        ? pay.payment_method_custom || "기타"
                        : PAYMENT_LABEL[pay.payment_method] ?? pay.payment_method,
                    ] as [string, string])
                  : null,
              ].filter(Boolean) as [string, string][]}
            />
          </Section>
        )}

        {(c.terms_snapshot ?? []).map((s, i) => (
          <Section key={s.key || i} title={`[${s.title || `섹션 ${i + 1}`}]`} note={s.required ? "필수" : "선택"}>
            {s.body ? (
              <div
                className="prose prose-sm max-w-none text-[12.5px] leading-relaxed text-[#3A342A] max-h-[280px] overflow-y-auto px-3 py-3 border border-[#E8E0D0]/70 rounded-lg bg-[#FBF7EB]/40"
                dangerouslySetInnerHTML={{ __html: contractBodyHtml(s.body) }}
              />
            ) : (
              <div className="text-[12.5px] text-[#A89B80] px-3 py-3 border border-[#E8E0D0]/70 rounded-lg bg-[#FBF7EB]/40">
                (본문이 비어 있습니다)
              </div>
            )}
            <label className="mt-3 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!agreed[s.key]}
                onChange={() => toggleAgree(s.key)}
                className="w-4 h-4 accent-[#6B7B3A]"
              />
              <span className="text-[13px] text-[#3A342A]">
                ({s.required ? "필수" : "선택"}) 위의 약관을 확인하였으며 동의합니다.
              </span>
            </label>
          </Section>
        ))}

        <Section title="서명">
          <div className="mb-3 text-[13px]">
            작성일: <strong>{today}</strong>
          </div>
          <div className="rounded-lg border border-[#E8E0D0] bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              className="block w-full h-40 touch-none cursor-crosshair"
              onMouseDown={start}
              onMouseMove={draw}
              onMouseUp={end}
              onMouseLeave={end}
              onTouchStart={start}
              onTouchMove={draw}
              onTouchEnd={end}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[12px] text-[#A89B80]">
              {signatureEmpty ? "여기에 서명해 주세요" : "서명 완료"}
            </span>
            <button
              type="button"
              onClick={clearSig}
              className="text-[12px] text-[#6B5D47] hover:underline"
            >
              서명 지우기
            </button>
          </div>
        </Section>

        {submitError && (
          <div className="mb-1 px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">
            {submitError}
          </div>
        )}

        <div className="text-[12px] text-[#8C8270]">
          {!hasTermsContent
            ? "계약서 본문이 없어 서명할 수 없어요."
            : !requiredOk
              ? `필수 약관 ${requiredSections.length}개 중 ${requiredSections.filter((s) => agreed[s.key]).length}개 동의 완료`
              : signatureEmpty
                ? "필수 약관 동의 완료 — 위 서명란에 서명해 주세요."
                : "모두 준비됐어요. 아래 버튼으로 서명을 확정해 주세요."}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !hasTermsContent || !requiredOk || signatureEmpty}
          className="w-full px-5 py-3 rounded-lg bg-[#6B7B3A] text-white text-[14.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "저장 중…" : "서명 완료하기"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] bg-[#FEFCF7] text-[14px] text-[#2A251D] focus:outline-none focus:border-[#6B7B3A]";

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-4 rounded-2xl border border-[#E8E0D0] bg-white">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14.5px] font-semibold">{title}</h2>
        {note && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold
              ${note === "필수"
                ? "bg-[#F5E4C8]/70 text-[#B47B2A]"
                : "bg-[#F5F0E5] text-[#8C8270]"
              }`}
          >
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-[12.5px] font-medium text-[#6B5D47] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function KvList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[#A89B80]">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
