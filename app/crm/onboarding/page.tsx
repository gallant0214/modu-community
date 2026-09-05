"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";

type Mode = "solo" | "center";
type Step = "mode" | "center-search" | "center-register" | "requested";

interface CenterSearchResult {
  id: number;
  name: string;
  region_sido: string | null;
  region_sigungu: string | null;
  phone: string | null;
}

export default function CrmOnboardingPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("solo");

  // 센터 등록 폼 (신규: 예시 스펙에 맞춰 확장)
  const [industry, setIndustry] = useState("");
  const [businessNo, setBusinessNo] = useState(""); // 000-00-00000 형식
  const [businessLicense, setBusinessLicense] = useState<{ dataUrl: string; name: string } | null>(null);
  const [centerName, setCenterName] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [logo, setLogo] = useState<{ dataUrl: string; name: string } | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerBirth, setOwnerBirth] = useState("");
  const [ownerGender, setOwnerGender] = useState<"male" | "female" | "">("");
  const [ownerPhone, setOwnerPhone] = useState("");

  // 센터 검색
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CenterSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // 가입 요청 완료 화면에 표시할 센터명
  const [requestedCenter, setRequestedCenter] = useState("");

  // 검색은 명시적 트리거 (버튼 클릭 또는 Enter). 자동 디바운스 안 함.
  const runSearch = async () => {
    const q = query.trim();
    setError("");
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      setSearching(true);
      const res = await fetch(`/api/crm/centers/search?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "검색에 실패했습니다");
      }
      setResults(data.centers ?? []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  // 검색 페이지 진입 시 입력 초기화
  useEffect(() => {
    if (step !== "center-search") {
      setSearched(false);
      setResults([]);
    }
  }, [step]);

  const submitMode = async () => {
    if (mode === "solo") {
      await submitSolo();
    } else {
      setStep("center-search");
    }
  };

  const submitSolo = async () => {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/bootstrap", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ mode: "solo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "등록에 실패했습니다");
      router.replace("/crm/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async () => {
    if (submitting) return;
    setError("");
    // 클라 단 필수 검증 (서버도 재검증)
    if (!industry) return setError("업종을 선택해 주세요");
    const bizDigits = businessNo.replace(/\D/g, "");
    if (bizDigits.length !== 10) return setError("사업자등록번호는 숫자 10자리로 입력해 주세요");
    if (!businessLicense) return setError("사업자등록증 사본을 첨부해 주세요");
    if (!centerName.trim()) return setError("센터명을 입력해 주세요");
    if (!phone.trim()) return setError("센터 전화번호를 입력해 주세요");
    if (!address.trim()) return setError("센터 주소를 입력해 주세요");
    if (!ownerName.trim()) return setError("대표자명을 입력해 주세요");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ownerBirth)) return setError("대표자 생년월일을 선택해 주세요");
    if (!ownerGender) return setError("대표자 성별을 선택해 주세요");
    if (!ownerPhone.trim()) return setError("대표자 휴대전화 번호를 입력해 주세요");

    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/bootstrap", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          mode: "center",
          name: centerName.trim(),
          phone: phone.trim(),
          business_no: bizDigits,
          industry,
          business_license_data_url: businessLicense.dataUrl,
          postal_code: postalCode.trim() || undefined,
          address: address.trim(),
          address_detail: addressDetail.trim() || undefined,
          logo_data_url: logo?.dataUrl,
          owner_name: ownerName.trim(),
          owner_birth: ownerBirth,
          owner_gender: ownerGender,
          owner_phone: ownerPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "등록에 실패했습니다");
      router.replace("/crm/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  // 사업자등록번호 자동 하이픈 (000-00-00000)
  const formatBizNo = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  };

  // 파일 → base64 dataURL 변환 (2MB 상한, 이미지 정사각형 검사는 로고에만)
  const readFileAsDataUrl = (
    file: File,
    opts: { maxBytes: number; requireSquareImage?: boolean; acceptTypes: string[] }
  ): Promise<{ dataUrl: string; name: string }> =>
    new Promise((resolve, reject) => {
      if (file.size > opts.maxBytes) return reject(new Error(`파일 크기는 ${Math.floor(opts.maxBytes / 1024 / 1024)}MB 이하여야 해요`));
      if (!opts.acceptTypes.includes(file.type)) {
        return reject(new Error(`지원 형식: ${opts.acceptTypes.map((t) => t.split("/")[1].toUpperCase()).join(", ")}`));
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("파일을 읽지 못했어요"));
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (!opts.requireSquareImage) {
          resolve({ dataUrl, name: file.name });
          return;
        }
        const img = new Image();
        img.onload = () => {
          if (img.width !== img.height) reject(new Error("정사각형 이미지만 사용할 수 있어요"));
          else resolve({ dataUrl, name: file.name });
        };
        img.onerror = () => reject(new Error("이미지를 읽지 못했어요"));
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

  const onPickLicense = async (file: File | null) => {
    if (!file) return;
    setError("");
    try {
      const r = await readFileAsDataUrl(file, {
        maxBytes: 2 * 1024 * 1024,
        acceptTypes: ["image/png", "image/jpeg", "application/pdf"],
      });
      setBusinessLicense(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    }
  };

  const onPickLogo = async (file: File | null) => {
    if (!file) return;
    setError("");
    try {
      const r = await readFileAsDataUrl(file, {
        maxBytes: 2 * 1024 * 1024,
        acceptTypes: ["image/png", "image/jpeg"],
        requireSquareImage: true,
      });
      setLogo(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    }
  };

  const joinCenter = async (centerId: number, centerName: string) => {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/centers/join", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ centerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "가입에 실패했습니다");
      // 이미 가입돼 있으면(멱등) 접속 선택 화면으로.
      if (data.onboarded) {
        router.replace("/crm/select");
        return;
      }
      // 신규/재요청 → 승인 대기. 성공 안내 화면 표시(대시보드로 튕기지 않음).
      setRequestedCenter(data.centerName || centerName || "");
      setStep("requested");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-5 py-8 md:py-12">
      <Header
        step={step}
        onBack={() => {
          setError("");
          if (step === "center-search") setStep("mode");
          else if (step === "center-register") setStep("center-search");
        }}
      />

      {step === "mode" && (
        <>
          <Title
            title="모두의 지도사 CRM 시작하기"
            desc="어떻게 사용하실 계획인가요? 나중에 설정에서 바꿀 수 있어요."
          />
          <div className="space-y-3">
            <ModeCard
              selected={mode === "solo"}
              onClick={() => setMode("solo")}
              title="개인 강사"
              desc="혼자 회원을 받아 수업해요. 별도 설정 없이 바로 시작할 수 있어요."
            />
            <ModeCard
              selected={mode === "center"}
              onClick={() => setMode("center")}
              title="센터 선택하기"
              desc="센터에 소속됐거나 직접 운영해요. 검색해서 가입하거나 새로 등록할 수 있어요."
            />
          </div>
          <PrimaryButton onClick={submitMode} disabled={submitting}>
            {submitting ? "처리 중…" : "다음"}
          </PrimaryButton>
        </>
      )}

      {step === "center-search" && (
        <>
          <Title
            title="센터 검색"
            desc="가입하실 센터를 검색해 주세요."
          />

          {/* 검색 입력 + 버튼 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="센터명을 입력하세요"
              className={`${inputClass} flex-1`}
              autoFocus
            />
            <button
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14px] font-semibold hover:bg-[#5a6932] transition-colors whitespace-nowrap"
            >
              {searching ? "검색 중…" : "검색"}
            </button>
          </div>

          {/* 검색 결과 */}
          <div className="mt-5">
            {searched && results.length > 0 && (
              <ul className="space-y-2">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => joinCenter(c.id, c.name)}
                      disabled={submitting}
                      className="w-full text-left px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors disabled:opacity-60"
                    >
                      <div className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                        {c.name}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">
                        {[c.region_sido, c.region_sigungu].filter(Boolean).join(" ") || "지역 정보 없음"}
                        {c.phone && <span> · {formatPhone(c.phone)}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {searched && results.length === 0 && (
              <div className="px-4 py-5 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
                일치하는 센터가 없습니다.
              </div>
            )}
          </div>

          {/* 등록 안내 (항상 표시) */}
          <div className="mt-6 px-4 py-4 rounded-2xl bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800">
            <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
              찾으시는 센터가 없나요?
            </div>
            <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
              센터 등록은 대표자나 관리자만 할 수 있어요.
            </div>
            <button
              onClick={() => setStep("center-register")}
              className="mt-3 w-full px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] bg-transparent hover:bg-[#6B7B3A]/5 text-[14px] font-semibold transition-colors"
            >
              센터 등록하기
            </button>
          </div>
        </>
      )}

      {step === "center-register" && (
        <>
          <Title
            title="신규 센터 등록"
            desc="현재 운영 중인 센터만 등록할 수 있어요. 오픈 예정 센터를 등록하려면 고객센터에 문의해 주세요."
          />

          {/* 진행 스텝 (시각적) — 현재는 '센터 정보' 단계만 활성. 프랜차이즈/카테고리는 추후 확장. */}
          <StepBar current={3} steps={["운영 형태", "프랜차이즈 정보", "센터 정보", "상품 카테고리"]} />

          <SubSection title="센터 정보">
            <Field label="업종" required>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={inputClass}
              >
                <option value="">선택해 주세요</option>
                <option value="health_pt">헬스장/PT샵</option>
                <option value="pilates">필라테스</option>
                <option value="yoga">요가</option>
                <option value="crossfit">크로스핏</option>
                <option value="martial_arts">무술/격투기</option>
                <option value="dance">댄스</option>
                <option value="swim">수영</option>
                <option value="etc">기타</option>
              </select>
            </Field>

            <Field label="사업자등록번호" required desc="숫자만 입력해 주세요.">
              <input
                type="text"
                inputMode="numeric"
                value={businessNo}
                onChange={(e) => setBusinessNo(formatBizNo(e.target.value))}
                placeholder="000-00-00000"
                maxLength={12}
                className={inputClass}
              />
            </Field>

            <Field label="사업자등록증 사본" required>
              <FilePicker
                accept="image/png,image/jpeg,application/pdf"
                fileName={businessLicense?.name}
                onPick={onPickLicense}
                onClear={() => setBusinessLicense(null)}
                hint="PNG, JPG 또는 PDF 파일 / 최대 2MB"
              />
            </Field>

            <Field label="센터명" required desc={`센터 이름을 정확하게 입력해 주세요. (예: 모두의지도사 강남점)`}>
              <div className="relative">
                <input
                  type="text"
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value.slice(0, 30))}
                  placeholder="예) 모두의지도사 강남점"
                  maxLength={30}
                  className={inputClass}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A89B80]">
                  {centerName.length}/30
                </span>
              </div>
            </Field>

            <Field label="센터 전화번호" required desc="숫자만 입력해 주세요.">
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="010-1234-5678"
                maxLength={13}
                className={inputClass}
              />
            </Field>

            <Field label="주소" required>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="우편번호"
                    inputMode="numeric"
                    className={`${inputClass} max-w-[130px]`}
                  />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="센터 주소를 입력해 주세요"
                    className={`${inputClass} flex-1`}
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={addressDetail}
                    onChange={(e) => setAddressDetail(e.target.value.slice(0, 60))}
                    placeholder="상세 주소를 입력해 주세요"
                    maxLength={60}
                    className={inputClass}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A89B80]">
                    {addressDetail.length}/60
                  </span>
                </div>
              </div>
            </Field>

            <Field label="센터 로고 이미지">
              <FilePicker
                accept="image/png,image/jpeg"
                fileName={logo?.name}
                onPick={onPickLogo}
                onClear={() => setLogo(null)}
                hint="PNG 또는 JPG 파일 / 최대 2MB / 정사각형 이미지만 사용 가능"
                previewDataUrl={logo?.dataUrl}
              />
            </Field>
          </SubSection>

          <SubSection title="대표자 정보">
            <Field label="대표자명" required desc="사업자등록증의 대표자와 동일하게 입력해 주세요.">
              <div className="relative">
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value.slice(0, 12))}
                  placeholder="예) 홍길동"
                  maxLength={12}
                  className={inputClass}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A89B80]">
                  {ownerName.length}/12
                </span>
              </div>
            </Field>

            <Field label="생년월일 / 성별" required>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={ownerBirth}
                  onChange={(e) => setOwnerBirth(e.target.value)}
                  className={`${inputClass} flex-1`}
                  max={new Date().toISOString().slice(0, 10)}
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOwnerGender("male")}
                    className={`px-4 py-2.5 rounded-lg border text-[13.5px] font-semibold transition-colors ${
                      ownerGender === "male"
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    남성
                  </button>
                  <button
                    type="button"
                    onClick={() => setOwnerGender("female")}
                    className={`px-4 py-2.5 rounded-lg border text-[13.5px] font-semibold transition-colors ${
                      ownerGender === "female"
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    여성
                  </button>
                </div>
              </div>
            </Field>

            <Field label="휴대전화 번호" required desc="숫자만 입력해 주세요.">
              <input
                type="tel"
                inputMode="numeric"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(formatPhone(e.target.value))}
                placeholder="010-1234-5678"
                maxLength={13}
                className={inputClass}
              />
            </Field>
          </SubSection>

          <PrimaryButton onClick={submitRegister} disabled={submitting}>
            {submitting ? "등록 중…" : "센터 등록하기"}
          </PrimaryButton>
        </>
      )}

      {step === "requested" && (
        <div className="text-center py-6">
          <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-[#EFF5E2] dark:bg-[#6B7B3A]/20">
            <svg className="w-8 h-8 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-[19px] font-bold text-[#241F18] dark:text-zinc-100">
            가입 요청이 접수됐어요
          </h2>
          <p className="mt-2 text-[13.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
            {requestedCenter ? <><span className="font-semibold text-[#3A342A] dark:text-zinc-200">{requestedCenter}</span>에 </> : null}
            강사 가입을 요청했어요.<br />
            <span className="font-semibold text-[#3A342A] dark:text-zinc-200">센터 대표자가 승인</span>하면 접속할 수 있어요.
          </p>
          <div className="mt-4 px-4 py-3 rounded-xl bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
            대표자에게 <span className="font-semibold">직원관리 &gt; 가입 요청</span>에서 수락해 달라고 알려주세요.
            승인 전까지는 접속 선택 화면에 <span className="font-semibold">‘승인 대기 중’</span>으로 표시돼요.
          </div>
          <PrimaryButton onClick={() => router.replace("/crm/select")}>
            접속 선택 화면으로
          </PrimaryButton>
        </div>
      )}

      {step !== "requested" && error && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:outline-none focus:border-[#6B7B3A]";

function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  if (step === "mode" || step === "requested") return null;
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 mb-4 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A] dark:hover:text-zinc-200"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      이전 단계
    </button>
  );
}

function Title({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center mb-6">
      <h1 className="text-[20px] md:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100">
        {title}
      </h1>
      <p className="mt-2 text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-4 rounded-2xl border transition-colors
        ${selected
          ? "border-[#6B7B3A] bg-[#6B7B3A]/5 dark:border-[#A8B87A] dark:bg-[#6B7B3A]/15"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
        }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0
            ${selected
              ? "border-[#6B7B3A] bg-[#6B7B3A]"
              : "border-[#A89B80] dark:border-zinc-500"
            }`}
        />
        <div>
          <div className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</div>
          <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-snug">
            {desc}
          </div>
        </div>
      </div>
    </button>
  );
}

function Field({
  label,
  required,
  desc,
  children,
}: {
  label: string;
  required?: boolean;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1">
        {label}
        {required && <span className="text-[#B47B2A] ml-1">*</span>}
      </span>
      {desc && (
        <span className="block text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-1.5">{desc}</span>
      )}
      {children}
    </label>
  );
}

function StepBar({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="mb-5 flex items-center gap-1.5">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex-1 flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11.5px] font-bold ${
                active
                  ? "bg-[#6B7B3A] text-white"
                  : done
                    ? "bg-[#6B7B3A]/20 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "bg-[#EDE4D4] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
              }`}
            >
              {n}
            </div>
            <div
              className={`text-[11px] truncate ${
                active
                  ? "font-semibold text-[#2A251D] dark:text-zinc-100"
                  : "text-[#A89B80] dark:text-zinc-500"
              }`}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-3 text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FilePicker({
  accept,
  fileName,
  onPick,
  onClear,
  hint,
  previewDataUrl,
}: {
  accept: string;
  fileName?: string;
  onPick: (f: File | null) => void;
  onClear: () => void;
  hint: string;
  previewDataUrl?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {previewDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewDataUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-[#E8E0D0] dark:border-zinc-700" />
        )}
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 cursor-pointer hover:border-[#6B7B3A]/50`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          파일 선택
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
        </label>
        {fileName && (
          <>
            <span className="text-[12.5px] text-[#3A342A] dark:text-zinc-300 truncate max-w-[200px]">{fileName}</span>
            <button
              type="button"
              onClick={onClear}
              className="text-[11.5px] text-[#B47B2A] hover:underline"
            >
              삭제
            </button>
          </>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-[#8C8270] dark:text-zinc-500">{hint}</p>
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[15px] font-semibold hover:bg-[#5a6932] transition-colors"
    >
      {children}
    </button>
  );
}
