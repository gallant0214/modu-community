"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../../_components/crm-modal";
import { formatPhone, formatWon } from "../../../_components/crm-labels";
import { DEFAULT_PT_CONTRACT_TERMS } from "../../../_components/pt-contract-terms";

interface PassInfo {
  id: number;
  lesson_kind: string;
  total_sessions: number;
  remaining_sessions: number;
  session_minutes: number;
  price_won: number;
  payment_method: string;
  payment_method_custom: string | null;
  issued_at: string;
  expires_at: string;
}

interface MemberInfo {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
  gender: string | null;
}

const GENDER_OPT = ["남", "여", "기타"] as const;

export default function CrmContractSignNewPage() {
  const router = useRouter();
  const params = useSearchParams();
  const memberId = params.get("member_id") ? Number(params.get("member_id")) : null;
  const passId = params.get("pass_id") ? Number(params.get("pass_id")) : null;
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<MemberInfo | null>(null);
  const [pass, setPass] = useState<PassInfo | null>(null);

  // 고객 기본 정보
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [exercisePurpose, setExercisePurpose] = useState("");
  const [visitRoute, setVisitRoute] = useState("");
  const [consultant, setConsultant] = useState("");

  // 약관 동의
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});

  // 서명
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const drawingRef = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(
      d.getDate()
    ).padStart(2, "0")}일`;
  }, []);

  // 회원/수강권 정보 자동 로드
  useEffect(() => {
    if (!memberId && !passId) return;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        if (memberId) {
          const res = await fetch(`/api/crm/members/${memberId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && data?.member) {
            const m = data.member as MemberInfo;
            setMember(m);
            if (!name) setName(m.name ?? "");
            if (!phone && m.phone) setPhone(formatPhone(m.phone));
            if (!birth && m.birth) setBirth(m.birth);
            if (!gender && m.gender) {
              setGender(m.gender === "M" ? "남" : m.gender === "F" ? "여" : "기타");
            }
          }
        }
        if (passId) {
          const res = await fetch(`/api/crm/passes/${passId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && data?.pass) setPass(data.pass);
        }
      } catch {
        // ignore
      }
    })();
  }, [memberId, passId, getIdToken, name, phone, birth, gender]);

  // 서명 캔버스 설정
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2A251D";
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
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
  const endDraw = () => {
    drawingRef.current = false;
  };
  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureEmpty(true);
  };

  const toggleAgree = (key: string) =>
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));

  const requiredOk = DEFAULT_PT_CONTRACT_TERMS.filter((t) => t.required).every(
    (t) => agreed[t.key]
  );

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("고객 이름을 입력해 주세요");
    if (!requiredOk) return setError("필수 약관에 모두 동의해 주세요");
    const canvas = canvasRef.current;
    if (!canvas || signatureEmpty) return setError("서명을 입력해 주세요");

    setSubmitting(true);
    try {
      const token = await getIdToken();
      const signatureDataUrl = canvas.toDataURL("image/png");
      const res = await fetch("/api/crm/contracts/sign", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          title: "피티 회원가입 계약서",
          member_id: memberId,
          pass_id: passId,
          customer_info: {
            name: name.trim(),
            phone: phone.trim(),
            birth: birth || null,
            gender,
            address: address.trim(),
            exercise_purpose: exercisePurpose.trim(),
            visit_route: visitRoute.trim(),
            consultant: consultant.trim(),
          },
          product_info: pass
            ? {
                lesson_kind: pass.lesson_kind,
                total_sessions: pass.total_sessions,
                session_minutes: pass.session_minutes,
                issued_at: pass.issued_at,
                expires_at: pass.expires_at,
              }
            : null,
          payment_info: pass
            ? {
                price_won: pass.price_won,
                payment_method: pass.payment_method,
                payment_method_custom: pass.payment_method_custom,
              }
            : null,
          terms_accepted: agreed,
          terms_snapshot: DEFAULT_PT_CONTRACT_TERMS,
          signature_data_url: signatureDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      router.push(`/crm/contracts`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setSubmitting(false);
    }
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[20px] md:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100">
          피티 회원가입 계약서
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          고객 정보를 확인하고 약관에 동의·서명한 뒤 저장해 주세요.
        </p>
      </header>

      {/* 고객 기본 정보 */}
      <Section title="고객 기본 정보">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="이름">
            <input
              className={crmInputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
            />
          </Field>
          <Field label="연락처">
            <input
              className={crmInputClass}
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="010-0000-0000"
            />
          </Field>
          <Field label="생년월일">
            <input
              type="date"
              className={crmInputClass}
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </Field>
          <Field label="성별">
            <select
              className={crmInputClass}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">선택</option>
              {GENDER_OPT.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="주소" full>
            <input
              className={crmInputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="운동목적">
            <input
              className={crmInputClass}
              value={exercisePurpose}
              onChange={(e) => setExercisePurpose(e.target.value)}
              placeholder="예: 다이어트, 체력증진"
              maxLength={80}
            />
          </Field>
          <Field label="방문경로">
            <input
              className={crmInputClass}
              value={visitRoute}
              onChange={(e) => setVisitRoute(e.target.value)}
              placeholder="예: 지인 소개, SNS"
              maxLength={80}
            />
          </Field>
          <Field label="상담 담당자" full>
            <input
              className={crmInputClass}
              value={consultant}
              onChange={(e) => setConsultant(e.target.value)}
              maxLength={40}
            />
          </Field>
        </div>
      </Section>

      {/* 구매 상품 정보 */}
      <Section title="구매 상품 정보">
        {pass ? (
          <KvList
            rows={[
              ["상품", pass.lesson_kind],
              ["총 세션", `${pass.total_sessions}회 (잔여 ${pass.remaining_sessions}회)`],
              ["세션 시간", `${pass.session_minutes}분`],
              ["발급일 ~ 만료일", `${pass.issued_at} ~ ${pass.expires_at}`],
            ]}
          />
        ) : (
          <Hint>
            수강권 정보가 자동입력되지 않았어요. 수강권을 발급한 뒤 진입하면
            상품/결제 정보가 자동 채워져요.
          </Hint>
        )}
      </Section>

      {/* 결제 정보 */}
      <Section title="결제 정보">
        {pass ? (
          <KvList
            rows={[
              ["결제 금액", `${formatWon(pass.price_won)}원`],
              [
                "결제 수단",
                pass.payment_method === "etc"
                  ? pass.payment_method_custom || "기타"
                  : pass.payment_method,
              ],
            ]}
          />
        ) : (
          <Hint>수강권 정보가 없으면 결제 정보도 비어 있어요.</Hint>
        )}
      </Section>

      {/* 약관 5종 */}
      {DEFAULT_PT_CONTRACT_TERMS.map((t) => (
        <Section
          key={t.key}
          title={`[${t.title}]`}
          headerNote={t.required ? "필수" : "선택"}
          noteColor={t.required ? "warn" : "info"}
        >
          <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-300 font-sans max-h-[260px] overflow-y-auto px-3 py-3 border border-[#E8E0D0]/70 dark:border-zinc-800 rounded-lg bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
            {t.body}
          </pre>
          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!agreed[t.key]}
              onChange={() => toggleAgree(t.key)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-300">
              ({t.required ? "필수" : "선택"}) 위의 약관을 확인하였으며 동의합니다.
            </span>
          </label>
        </Section>
      ))}

      {/* 날짜 + 서명 */}
      <Section title="서명">
        <div className="mb-3 text-[13px] text-[#3A342A] dark:text-zinc-300">
          작성일: <strong className="text-[#2A251D] dark:text-zinc-100">{today}</strong>
        </div>
        <div className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="block w-full h-40 touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] text-[#A89B80]">
            {signatureEmpty ? "여기에 서명해 주세요" : "서명 완료"}
          </span>
          <button
            type="button"
            onClick={clearSignature}
            className="text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:underline"
          >
            서명 지우기
          </button>
        </div>
      </Section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 pb-10">
        <Link
          href="/crm/contracts"
          className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
        >
          돌아가기
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
        >
          {submitting ? "저장 중…" : "전자 계약서 저장"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  headerNote,
  noteColor,
  children,
}: {
  title: string;
  headerNote?: string;
  noteColor?: "warn" | "info";
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</h2>
        {headerNote && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold
              ${noteColor === "warn"
                ? "bg-[#F5E4C8]/70 text-[#B47B2A] dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-[#F5F0E5] text-[#8C8270] dark:bg-zinc-800 dark:text-zinc-400"
              }`}
          >
            {headerNote}
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
      <span className="block text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
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
          <dt className="text-[#A89B80] dark:text-zinc-500">{k}</dt>
          <dd className="text-[#2A251D] dark:text-zinc-100 font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
      {children}
    </div>
  );
}
