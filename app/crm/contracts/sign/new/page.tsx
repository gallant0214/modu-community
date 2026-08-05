"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../../_components/crm-modal";
import { formatPhone, formatWon } from "../../../_components/crm-labels";
import { DEFAULT_PT_CONTRACT_TERMS } from "../../../_components/pt-contract-terms";
import { contractBodyHtml } from "@/app/lib/contract-body";

interface TemplateSection {
  key: string;
  title: string;
  body: string;
  required: boolean;
}

interface Template {
  id: number;
  category: string;
  title: string;
  body: string;
  sections?: TemplateSection[];
}

interface PassInfo {
  id: number;
  trainer_member_id: number;
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

interface TrainerOption {
  id: number;
  display_name: string;
  role: string;
}

interface MemberInfo {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
  gender: string | null;
}

const GENDER_OPT = ["남", "여"] as const;

export default function CrmContractSignNewPage() {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/crm/settings?tab=contracts");
  };
  const params = useSearchParams();
  const memberId = params.get("member_id") ? Number(params.get("member_id")) : null;
  const staffMemberId = params.get("staff_member_id") ? Number(params.get("staff_member_id")) : null;
  const isStaff = !!staffMemberId;
  const passId = params.get("pass_id") ? Number(params.get("pass_id")) : null;
  const membershipId = params.get("membership_id") ? Number(params.get("membership_id")) : null;
  const templateId = params.get("template_id") ? Number(params.get("template_id")) : null;
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<MemberInfo | null>(null);
  const [pass, setPass] = useState<PassInfo | null>(null);
  const [membership, setMembership] = useState<{
    id: number;
    plan_name: string;
    duration_days: number;
    price_won: number;
    payment_method: string;
    payment_method_custom: string | null;
    start_date: string;
    expires_at: string;
  } | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);

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

  // 회원 서명
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const drawingRef = useRef(false);

  // 강사 서명
  const trainerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [trainerSignatureEmpty, setTrainerSignatureEmpty] = useState(true);
  const trainerDrawingRef = useRef(false);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(
      d.getDate()
    ).padStart(2, "0")}일`;
  }, []);

  // 회원/직원/수강권 정보 자동 로드
  useEffect(() => {
    if (!memberId && !passId && !staffMemberId && !templateId) return;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        if (staffMemberId) {
          const res = await fetch(`/api/crm/staff/${staffMemberId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && data?.member) {
            const s = data.member;
            if (!name) setName(s.display_name ?? "");
            if (!phone && s.phone) setPhone(formatPhone(s.phone));
          }
        }
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
              setGender(m.gender === "M" ? "남" : m.gender === "F" ? "여" : "");
            }
          }
        }
        if (passId) {
          const res = await fetch(`/api/crm/passes/${passId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && data?.pass) {
            setPass(data.pass);
            // 수강권에 등록된 강사를 기본 서명자로 자동 선택
            if (data.pass.trainer_member_id) {
              setSelectedTrainerId(data.pass.trainer_member_id);
            }
          }
        }
        if (membershipId) {
          const res = await fetch(`/api/crm/memberships?member_id=${memberId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && Array.isArray(data?.memberships)) {
            const found = data.memberships.find(
              (m: { id: number }) => m.id === membershipId
            );
            if (found) setMembership(found);
          }
        }
        if (templateId) {
          const res = await fetch(`/api/crm/contracts/${templateId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && data?.contract) setTemplate(data.contract);
        }
      } catch {
        // ignore
      }
    })();
  }, [memberId, staffMemberId, passId, membershipId, templateId, getIdToken, name, phone, birth, gender]);

  // 강사 목록 로드 (활성 trainer/manager)
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/staff", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const list: TrainerOption[] = (data.staff ?? []).filter(
          (s: { status: string; role: string }) =>
            s.status === "active" &&
            (s.role === "trainer" || s.role === "manager" || s.role === "owner" || s.role === "admin")
        );
        setTrainers(list);
      } catch {
        // ignore
      }
    })();
  }, [getIdToken]);

  // 두 서명 캔버스 공통 설정
  const setupCanvas = (canvas: HTMLCanvasElement | null) => {
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
  };
  useEffect(() => {
    setupCanvas(canvasRef.current);
    setupCanvas(trainerCanvasRef.current);
  }, []);

  const getPos = (canvas: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent) => {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const makeSignatureHandlers = (
    ref: React.RefObject<HTMLCanvasElement | null>,
    drawing: React.MutableRefObject<boolean>,
    setEmpty: (v: boolean) => void
  ) => ({
    start: (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const ctx = ref.current?.getContext("2d");
      if (!ctx) return;
      drawing.current = true;
      const { x, y } = getPos(ref.current, e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    move: (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = ref.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(ref.current, e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setEmpty(false);
    },
    end: () => {
      drawing.current = false;
    },
    clear: () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setEmpty(true);
    },
  });

  const memberSig = makeSignatureHandlers(canvasRef, drawingRef, setSignatureEmpty);
  const trainerSig = makeSignatureHandlers(
    trainerCanvasRef,
    trainerDrawingRef,
    setTrainerSignatureEmpty
  );

  const toggleAgree = (key: string) =>
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));

  const requiredOk = (() => {
    if (template && Array.isArray(template.sections) && template.sections.length > 0) {
      return template.sections
        .filter((s) => s.required)
        .every((s, i) => agreed[`sec_${s.key || i}`]);
    }
    if (template) {
      return !!agreed[`template_${template.id}`];
    }
    return DEFAULT_PT_CONTRACT_TERMS.filter((t) => t.required).every((t) => agreed[t.key]);
  })();

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("고객 이름을 입력해 주세요");
    if (!requiredOk) return setError("필수 약관에 모두 동의해 주세요");
    const canvas = canvasRef.current;
    if (!canvas || signatureEmpty) return setError("가입 회원 서명을 입력해 주세요");
    const trainerCanvas = trainerCanvasRef.current;
    if (!trainerCanvas || trainerSignatureEmpty) return setError("계약 직원 서명을 입력해 주세요");
    if (!selectedTrainerId) return setError("계약 직원을 선택해 주세요");

    setSubmitting(true);
    try {
      const token = await getIdToken();
      const signatureDataUrl = canvas.toDataURL("image/png");
      const trainerSignatureDataUrl = trainerCanvas.toDataURL("image/png");
      const trainerName =
        trainers.find((t) => t.id === selectedTrainerId)?.display_name ?? null;
      const res = await fetch("/api/crm/contracts/sign", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          title: template?.title || (isStaff ? "근로 계약서" : "피티 회원가입 계약서"),
          member_id: isStaff ? null : memberId,
          staff_member_id: staffMemberId,
          pass_id: passId,
          membership_id: membershipId,
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
            : membership
              ? {
                  plan_name: membership.plan_name,
                  duration_days: membership.duration_days,
                  start_date: membership.start_date,
                  expires_at: membership.expires_at,
                }
              : null,
          payment_info: pass
            ? {
                price_won: pass.price_won,
                payment_method: pass.payment_method,
                payment_method_custom: pass.payment_method_custom,
              }
            : membership
              ? {
                  price_won: membership.price_won,
                  payment_method: membership.payment_method,
                  payment_method_custom: membership.payment_method_custom,
                }
              : null,
          trainer_signature_data_url: trainerSignatureDataUrl,
          trainer_info: {
            center_member_id: selectedTrainerId,
            name: trainerName,
          },
          terms_accepted: agreed,
          terms_snapshot:
            template && Array.isArray(template.sections) && template.sections.length > 0
              ? template.sections.map((s, i) => ({
                  key: `sec_${s.key || i}`,
                  title: s.title,
                  body: s.body,
                  required: !!s.required,
                }))
              : template
                ? [
                    {
                      key: `template_${template.id}`,
                      title: template.title,
                      body: template.body,
                      required: true,
                    },
                  ]
                : DEFAULT_PT_CONTRACT_TERMS,
          signature_data_url: signatureDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      if (isStaff) router.push(`/crm/staff/${staffMemberId}`);
      else if (memberId) router.push(`/crm/members/${memberId}?purchase=done`);
      else goBack();
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
        ) : membership ? (
          <KvList
            rows={[
              ["상품(회원권)", membership.plan_name],
              ["기간", `${membership.duration_days}일`],
              ["시작 ~ 만료", `${membership.start_date} ~ ${membership.expires_at}`],
            ]}
          />
        ) : (
          <Hint>
            수강권/회원권 정보가 자동입력되지 않았어요. 발급 후 진입하면
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
        ) : membership ? (
          <KvList
            rows={[
              ["결제 금액", `${formatWon(membership.price_won)}원`],
              [
                "결제 수단",
                membership.payment_method === "etc"
                  ? membership.payment_method_custom || "기타"
                  : membership.payment_method,
              ],
            ]}
          />
        ) : (
          <Hint>수강권/회원권 정보가 없으면 결제 정보도 비어 있어요.</Hint>
        )}
      </Section>

      {/* 약관: 템플릿 sections > body > 기본 5종 순서로 폴백 */}
      {template && Array.isArray(template.sections) && template.sections.length > 0 ? (
        template.sections.map((s, i) => (
          <Section
            key={s.key || i}
            title={`[${s.title || `섹션 ${i + 1}`}]`}
            headerNote={s.required ? "필수" : "선택"}
            noteColor={s.required ? "warn" : "info"}
          >
            <div
              className="prose prose-sm max-w-none text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-300 max-h-[320px] overflow-y-auto px-3 py-3 border border-[#E8E0D0]/70 dark:border-zinc-800 rounded-lg bg-[#FBF7EB]/40 dark:bg-zinc-900/40"
              dangerouslySetInnerHTML={{ __html: contractBodyHtml(s.body) || "(본문이 비어 있습니다)" }}
            />
            <label className="mt-3 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!agreed[`sec_${s.key || i}`]}
                onChange={() => toggleAgree(`sec_${s.key || i}`)}
                className="w-4 h-4 accent-[#6B7B3A]"
              />
              <span className="text-[13px] text-[#3A342A] dark:text-zinc-300">
                ({s.required ? "필수" : "선택"}) 위의 약관을 확인하였으며 동의합니다.
              </span>
            </label>
          </Section>
        ))
      ) : template ? (
        <Section
          title={`[${template.title}]`}
          headerNote="필수"
          noteColor="warn"
        >
          <div
            className="prose prose-sm max-w-none text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-300 max-h-[420px] overflow-y-auto px-3 py-3 border border-[#E8E0D0]/70 dark:border-zinc-800 rounded-lg bg-[#FBF7EB]/40 dark:bg-zinc-900/40"
            dangerouslySetInnerHTML={{ __html: contractBodyHtml(template.body) || "(본문이 비어 있습니다)" }}
          />
          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!agreed[`template_${template.id}`]}
              onChange={() => toggleAgree(`template_${template.id}`)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-300">
              (필수) 위의 약관을 확인하였으며 동의합니다.
            </span>
          </label>
        </Section>
      ) : (
        DEFAULT_PT_CONTRACT_TERMS.map((t) => (
          <Section
            key={t.key}
            title={`[${t.title}]`}
            headerNote={t.required ? "필수" : "선택"}
            noteColor={t.required ? "warn" : "info"}
          >
            <div
              className="prose prose-sm max-w-none text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-300 max-h-[260px] overflow-y-auto px-3 py-3 border border-[#E8E0D0]/70 dark:border-zinc-800 rounded-lg bg-[#FBF7EB]/40 dark:bg-zinc-900/40"
              dangerouslySetInnerHTML={{ __html: contractBodyHtml(t.body) }}
            />
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
        ))
      )}

      {/* 날짜 + 서명 (강사 · 계약자) */}
      <Section title="서명">
        <div className="mb-3 text-[13px] text-[#3A342A] dark:text-zinc-300">
          작성일: <strong className="text-[#2A251D] dark:text-zinc-100">{today}</strong>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 계약 직원 서명 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                계약 직원
              </label>
              <select
                value={selectedTrainerId ?? ""}
                onChange={(e) =>
                  setSelectedTrainerId(e.target.value ? Number(e.target.value) : null)
                }
                className="px-2 py-1 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-950 text-[12.5px] text-[#2A251D] dark:text-zinc-100 max-w-[160px]"
              >
                <option value="">담당자 선택</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden">
              {/* 이름 라벨: "이종식 : " */}
              <div className="absolute top-2 left-3 pointer-events-none text-[13px] font-semibold text-[#8C8270] dark:text-zinc-500">
                {(trainers.find((t) => t.id === selectedTrainerId)?.display_name ?? "계약 직원") + " :"}
              </div>
              <canvas
                ref={trainerCanvasRef}
                className="block w-full h-40 touch-none cursor-crosshair"
                onMouseDown={trainerSig.start}
                onMouseMove={trainerSig.move}
                onMouseUp={trainerSig.end}
                onMouseLeave={trainerSig.end}
                onTouchStart={trainerSig.start}
                onTouchMove={trainerSig.move}
                onTouchEnd={trainerSig.end}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12px] text-[#A89B80]">
                {trainerSignatureEmpty ? "여기에 서명해 주세요" : "서명 완료"}
              </span>
              <button
                type="button"
                onClick={trainerSig.clear}
                className="text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:underline"
              >
                서명 지우기
              </button>
            </div>
          </div>

          {/* 가입 회원 서명 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                가입 회원
              </label>
              <span className="text-[12.5px] text-[#8C8270] dark:text-zinc-500">
                {name || "이름 입력 필요"}
              </span>
            </div>
            <div className="relative rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden">
              <div className="absolute top-2 left-3 pointer-events-none text-[13px] font-semibold text-[#8C8270] dark:text-zinc-500">
                {(name || "가입 회원") + " :"}
              </div>
              <canvas
                ref={canvasRef}
                className="block w-full h-40 touch-none cursor-crosshair"
                onMouseDown={memberSig.start}
                onMouseMove={memberSig.move}
                onMouseUp={memberSig.end}
                onMouseLeave={memberSig.end}
                onTouchStart={memberSig.start}
                onTouchMove={memberSig.move}
                onTouchEnd={memberSig.end}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12px] text-[#A89B80]">
                {signatureEmpty ? "여기에 서명해 주세요" : "서명 완료"}
              </span>
              <button
                type="button"
                onClick={memberSig.clear}
                className="text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:underline"
              >
                서명 지우기
              </button>
            </div>
          </div>
        </div>
      </Section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 pb-10">
        <button
          type="button"
          onClick={goBack}
          className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
        >
          돌아가기
        </button>
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
