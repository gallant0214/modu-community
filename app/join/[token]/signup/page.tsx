"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { contractBodyHtml } from "@/app/lib/contract-body";

/* 신규 회원 웹 가입 — QR/가입링크 → '신규 회원 가입하기' 로 진입.
   단계: 정보입력 → 헬스이용권 → 운동복 → 락커 → 요약 → 전자계약서(서명) → (다음: 셀카·결제·앱연동)
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
interface ContractSection {
  key: string;
  title: string;
  body: string;
  required: boolean;
}
interface ContractTemplate {
  id: number;
  title: string;
  sections: ContractSection[];
}

type Step = "info" | "membership" | "apparel" | "locker" | "summary" | "contract" | "selfie";
const ORDER: Step[] = ["info", "membership", "apparel", "locker", "summary", "contract", "selfie"];

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

  // 전자계약서
  const [contractTpl, setContractTpl] = useState<ContractTemplate | null>(null);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  // 서명 data URL (계약서 단계를 벗어나도 유지 — 캔버스는 언마운트되므로 값만 보관)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");

  // 셀카 본인확인 촬영
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null); // 촬영 직후 미리보기(저장 전)
  const [faceDataUrl, setFaceDataUrl] = useState<string>(""); // 저장 확정된 본인확인 사진
  const [cameraErr, setCameraErr] = useState("");

  // 최종 제출(회원·계약·얼굴·주문 생성 → 결제)
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pRes, cRes] = await Promise.all([
          fetch(`/api/crm/join/signup-products?token=${encodeURIComponent(token)}`, { cache: "no-store" }),
          fetch(`/api/crm/join/signup-contract?token=${encodeURIComponent(token)}`, { cache: "no-store" }),
        ]);
        const d = await pRes.json();
        if (!pRes.ok) throw new Error(d?.error || "불러오지 못했어요");
        setData(d);
        const c = await cRes.json();
        if (cRes.ok && c.template) setContractTpl(c.template as ContractTemplate);
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
  // 생년월일: 숫자만 입력받아 YYYY-MM-DD 로 자동 하이픈
  const fmtBirth = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length < 5) return d;
    if (d.length < 7) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  };
  // 실제 존재하는 날짜 + 합리적 연도(1900~올해) + 미래 아님 검사
  const isValidBirth = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, day] = s.split("-").map(Number);
    const now = new Date();
    if (y < 1900 || y > now.getFullYear()) return false;
    if (m < 1 || m > 12) return false;
    const dt = new Date(y, m - 1, day);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== day) return false;
    if (dt.getTime() > now.getTime()) return false; // 미래 날짜 불가
    return true;
  };
  const birthError = birth.length >= 8 && !isValidBirth(birth);

  // 계약서 섹션/필수동의 상태
  const sections = contractTpl?.sections ?? [];
  const requiredSections = sections.filter((s) => s?.required);
  const requiredOk =
    requiredSections.length > 0 && requiredSections.every((s) => agreed[s.key]);
  const toggleAgree = (k: string) => setAgreed((prev) => ({ ...prev, [k]: !prev[k] }));

  // 서명 캔버스 초기화 — 계약서 단계에 들어올 때마다
  useEffect(() => {
    if (step !== "contract") return;
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
    // 이전에 서명했다가 되돌아온 경우: 빈 캔버스로 두되 기존 값 유지(재서명 시 덮어씀)
    setSignatureEmpty(!signatureDataUrl);
  }, [step, contractTpl, signatureDataUrl]);

  const sigPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const sigStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = sigPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const sigDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = sigPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setSignatureEmpty(false);
  };
  const sigEnd = () => {
    drawingRef.current = false;
    const c = canvasRef.current;
    if (c && !signatureEmpty) setSignatureDataUrl(c.toDataURL("image/png"));
  };
  const sigClear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setSignatureEmpty(true);
    setSignatureDataUrl("");
  };

  // ── 셀카 카메라 ──
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  const startCamera = useCallback(async () => {
    setCameraErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraErr("카메라를 열 수 없어요. 권한을 확인해 주세요.");
    }
  }, []);
  // 셀카 단계 진입 시(저장본·미리보기가 없을 때) 카메라 시작, 벗어나면 정지
  useEffect(() => {
    if (step === "selfie" && !facePreview && !faceDataUrl) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step, facePreview, faceDataUrl, startCamera, stopCamera]);

  // 800x800 q82 (출석 등록과 동일 등급)
  const captureFace = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 800;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 800, 800);
    setFacePreview(c.toDataURL("image/jpeg", 0.82));
    stopCamera();
  };
  const retakeFace = () => {
    setFacePreview(null);
    setFaceDataUrl("");
  };
  const saveFace = () => {
    if (facePreview) setFaceDataUrl(facePreview);
  };

  // 120x120 q60 썸네일 (출석 등록과 동일)
  const makeThumb = (dataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 120;
        c.height = 120;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, 120, 120);
        resolve(c.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const submitSignup = async () => {
    if (submitting) return;
    setSubmitErr("");
    if (!faceDataUrl) return setSubmitErr("본인 확인 사진을 저장해 주세요");
    if (!signatureDataUrl) return setSubmitErr("전자계약서 서명이 필요해요");
    setSubmitting(true);
    try {
      const faceThumb = await makeThumb(faceDataUrl);
      const res = await fetch(`/api/crm/join/signup/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          name,
          phone,
          birth,
          gender,
          membershipId,
          apparelId,
          lockerId,
          faceImage: faceDataUrl,
          faceThumb,
          signature: signatureDataUrl,
          termsAccepted: agreed,
          contractTemplateId: contractTpl?.id,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.payUrl) throw new Error(d?.error || "결제를 시작하지 못했어요");
      window.location.href = d.payUrl;
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "네트워크 오류");
      setSubmitting(false);
    }
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
        isValidBirth(birth) &&
        !!gender
      );
    if (step === "membership") return membershipId != null;
    if (step === "contract") return !!contractTpl && requiredOk && !signatureEmpty;
    return true; // apparel/locker/summary 는 선택 안 함 허용
  }, [step, name, phone, birth, gender, membershipId, contractTpl, requiredOk, signatureEmpty]);

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
              <input
                value={birth}
                onChange={(e) => setBirth(fmtBirth(e.target.value))}
                inputMode="numeric"
                placeholder="19950321"
                maxLength={10}
                className={`${inputCls} ${birthError ? "border-red-400 focus:border-red-400" : ""}`}
              />
              {birthError && (
                <div className="mt-1.5 text-[12px] text-red-500">
                  생년월일을 올바르게 입력해 주세요. (예: 1995-03-21)
                </div>
              )}
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
              다음 단계에서 전자계약서에 동의·서명하면, 이어서 본인확인 촬영과 결제가 진행됩니다.
            </div>
          </StepBody>
        )}

        {step === "contract" && (
          <StepBody title="전자계약서에 동의해 주세요" sub={contractTpl?.title || "헬스 이용 계약서"}>
            {!contractTpl ? (
              <Empty text="센터에 등록된 가입 계약서가 없어요. 센터에 문의해 주세요." />
            ) : (
              <>
                {sections.map((s, i) => (
                  <div key={s.key || i} className="rounded-2xl border border-[#E8E0D0] bg-white p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[14px] font-bold text-[#2A251D]">
                        {s.title || `약관 ${i + 1}`}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          s.required ? "bg-[#F5E4C8] text-[#B47B2A]" : "bg-[#F0ECE1] text-[#8C8270]"
                        }`}
                      >
                        {s.required ? "필수" : "선택"}
                      </span>
                    </div>
                    <div
                      className="text-[12.5px] leading-relaxed text-[#3A342A] max-h-[220px] overflow-y-auto px-3 py-2.5 border border-[#EFE7D5] rounded-lg bg-[#FBF7EB]/50"
                      dangerouslySetInnerHTML={{ __html: contractBodyHtml(s.body) }}
                    />
                    <label className="mt-3 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!agreed[s.key]}
                        onChange={() => toggleAgree(s.key)}
                        className="w-4 h-4 accent-[#6B7B3A]"
                      />
                      <span className="text-[13px] text-[#3A342A]">
                        [{s.required ? "필수" : "선택"}] 위 내용을 확인하였으며 동의합니다.
                      </span>
                    </label>
                  </div>
                ))}

                <div className="rounded-2xl border border-[#E8E0D0] bg-white p-4">
                  <div className="text-[14px] font-bold text-[#2A251D] mb-2">본인 서명</div>
                  <div className="rounded-lg border border-[#E8E0D0] bg-white overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      className="block w-full h-40 touch-none cursor-crosshair"
                      onMouseDown={sigStart}
                      onMouseMove={sigDraw}
                      onMouseUp={sigEnd}
                      onMouseLeave={sigEnd}
                      onTouchStart={sigStart}
                      onTouchMove={sigDraw}
                      onTouchEnd={sigEnd}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[12px] text-[#A89B80]">
                      {signatureEmpty ? "여기에 서명해 주세요" : "서명 완료"}
                    </span>
                    <button type="button" onClick={sigClear} className="text-[12px] text-[#6B5D47] underline">
                      서명 지우기
                    </button>
                  </div>
                </div>

                <div className="text-[12px] text-[#8C8270]">
                  {!requiredOk
                    ? `필수 약관 ${requiredSections.length}개 중 ${requiredSections.filter((s) => agreed[s.key]).length}개 동의 완료`
                    : signatureEmpty
                      ? "필수 약관 동의 완료 — 위 서명란에 서명해 주세요."
                      : "모두 준비됐어요. 아래 버튼으로 다음 단계로 진행하세요."}
                </div>
              </>
            )}
          </StepBody>
        )}

        {step === "selfie" && (
          <StepBody title="본인 확인 사진을 촬영해 주세요" sub="센터 본인 확인용">
            {/* 카메라 위 안내 문구 */}
            <div className="rounded-xl bg-[#FBF7EB] border border-[#EFE7D5] px-4 py-3 text-[12.5px] text-[#6B5D47] leading-relaxed text-center">
              마스크를 벗어주세요 · 정면을 바라봐주세요
              <br />센터에 본인 확인 용으로만 저장됩니다
            </div>

            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
              {facePreview || faceDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={facePreview || faceDataUrl}
                  alt="촬영본"
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : (
                <>
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  {/* 출석 화면과 동일한 얼굴 가이드 동그라미 */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[62%] h-[78%] rounded-[50%] border-2 border-white/70" />
                  </div>
                </>
              )}
            </div>

            {cameraErr && (
              <div className="px-3 py-2 rounded-lg bg-red-50 text-[12.5px] text-red-700 text-center">
                {cameraErr}
              </div>
            )}

            {faceDataUrl ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#6B7B3A]">✓ 본인 확인 사진이 저장됐어요</span>
                <button type="button" onClick={retakeFace} className="text-[13px] text-[#6B5D47] underline">
                  다시 촬영
                </button>
              </div>
            ) : facePreview ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={retakeFace}
                  className="flex-1 py-3.5 rounded-xl border border-[#E8E0D0] text-[15px] font-semibold text-[#6B5D47]"
                >
                  다시 촬영
                </button>
                <button
                  type="button"
                  onClick={saveFace}
                  className="flex-1 py-3.5 rounded-xl bg-[#6B7B3A] text-white text-[15px] font-bold hover:bg-[#5a6932]"
                >
                  저장하기
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={captureFace}
                disabled={!!cameraErr}
                className="w-full py-3.5 rounded-xl bg-[#6B7B3A] text-white text-[16px] font-bold hover:bg-[#5a6932] disabled:bg-[#CFC6AE]"
              >
                촬영
              </button>
            )}
          </StepBody>
        )}
      </div>

      {/* 하단 CTA */}
      <div className="sticky bottom-0 bg-gradient-to-t from-[#FBF7EB] via-[#FBF7EB] to-transparent pt-4 pb-5">
        {step === "summary" ? (
          <button
            onClick={next}
            className="w-full py-4 rounded-2xl bg-[#6B7B3A] text-white text-[16px] font-bold transition-colors hover:bg-[#5a6932]"
          >
            전자계약서 작성하기
          </button>
        ) : step === "contract" ? (
          <button
            onClick={next}
            disabled={!canNext}
            className="w-full py-4 rounded-2xl bg-[#6B7B3A] text-white text-[16px] font-bold transition-colors disabled:bg-[#CFC6AE] hover:bg-[#5a6932]"
            title={canNext ? "" : "필수 약관 동의와 서명을 완료해 주세요"}
          >
            본인확인 촬영하기
          </button>
        ) : step === "selfie" ? (
          <>
            {submitErr && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700 text-center">
                {submitErr}
              </div>
            )}
            <button
              onClick={submitSignup}
              disabled={!faceDataUrl || submitting}
              className="w-full py-4 rounded-2xl bg-[#6B7B3A] text-white text-[16px] font-bold transition-colors disabled:bg-[#CFC6AE] hover:bg-[#5a6932]"
              title={faceDataUrl ? "" : "본인 확인 사진을 촬영·저장해 주세요"}
            >
              {submitting ? "결제 준비 중…" : `${won(total)}원 결제하기`}
            </button>
          </>
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
