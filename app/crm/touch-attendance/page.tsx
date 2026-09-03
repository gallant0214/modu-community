"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";
import FaceAttendance from "./face-attendance";
import FaceEnroll from "./face-enroll";
import QrDisplay from "./qr-display";
import { speakMessages, playWarningBeep, playCheckinChime, primeSpeech, primeAudio } from "./_speak";

interface MemberLite {
  id: number;
  name: string;
  phone: string | null;
  birth?: string | null;
  has_face?: boolean;
  face_thumb?: string | null;
}

interface CheckinSummary {
  mileage: number;
  coupon_count: number;
  can_enter: boolean;
  not_started?: boolean;
  memberships: { id: number; plan_name: string; expires_at: string; is_paused: boolean }[];
  passes: {
    id: number;
    lesson_kind: string;
    remaining_sessions: number;
    total_sessions: number;
    expires_at: string;
    is_paused: boolean;
  }[];
  rentals: { id: number; item_name: string; expires_at: string }[];
  lockers: { id: number; number: number; expires_at: string; zone_name: string }[];
  week_present: boolean[];
  week_start_ymd: string;
}

// 미리보기용 샘플 얼굴 사진(SVG data URI) — 실제 회원 사진 대신 레이아웃 확인용.
const PREVIEW_SAMPLE_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='#6B7B3A'/><circle cx='80' cy='62' r='32' fill='#EDE7D6'/><rect x='34' y='104' width='92' height='72' rx='36' fill='#EDE7D6'/></svg>"
  );

type Result =
  | {
      kind: "success";
      name: string;
      birth: string | null;
      phone: string | null;
      photo?: string | null; // 회원 얼굴 썸네일(있으면 확인창에 표시)
      duplicate?: boolean;
      mileageAwarded?: number;
      summary?: CheckinSummary;
    }
  | { kind: "error"; message: string };

/**
 * /crm/touch-attendance — 출석번호 입력식 터치 출석 화면 (새 창).
 * 회원이 본인 출석번호를 누르고 '출석하기' → 체크인.
 * 동일 번호가 여러 명이면 이름을 골라 체크인.
 * 태블릿용 가로형/세로형 레이아웃 전환 지원.
 */
export default function TouchAttendancePage() {
  return <TouchAttendanceKiosk />;
}

/**
 * 터치출석 코어. kioskToken 이 있으면 로그인 없이 공개 링크(/touch/[token]) 모드로
 * 동작 — 번호/얼굴/번호+얼굴 3개 모드 모두 공개 엔드포인트(/api/touch/[token]/*) 사용.
 * (공개 모드는 얼굴 '등록'은 없고 인식만; 번호 조회 결과의 얼굴 미등록자는 바로 체크인)
 */
export function TouchAttendanceKiosk({ kioskToken }: { kioskToken?: string }) {
  const kiosk = !!kioskToken;
  const { getIdToken } = useAuth();
  const [num, setNum] = useState("");
  const [candidates, setCandidates] = useState<MemberLite[] | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<MemberLite | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // 디자인 미리보기: /crm/touch-attendance?preview=1 → 출석 확인창을 가짜 데이터로 바로 표시(자동 닫힘 없음)
  const [previewMode, setPreviewMode] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).get("preview")) return;
    setPreviewMode(true);
    setResult({
      kind: "success",
      name: "홍길동",
      birth: "1990-03-15",
      phone: "010-1234-5678",
      photo: PREVIEW_SAMPLE_PHOTO,
      duplicate: false,
      mileageAwarded: 150,
      summary: {
        mileage: 3200,
        coupon_count: 1,
        can_enter: true,
        not_started: false,
        memberships: [{ id: 1, plan_name: "6개월 헬스", expires_at: "2027-01-31", is_paused: false }],
        passes: [{ id: 1, lesson_kind: "PT 10회", remaining_sessions: 7, total_sessions: 10, expires_at: "2026-12-31", is_paused: false }],
        rentals: [{ id: 1, item_name: "운동복", expires_at: "2027-01-31" }],
        lockers: [{ id: 1, number: 12, expires_at: "2027-01-31", zone_name: "남자탈의실" }],
        week_present: [false, true, false, true, false, true, false],
        week_start_ymd: "2026-08-31",
      },
    });
  }, []);
  const [busy, setBusy] = useState(false);
  const [centerName, setCenterName] = useState("");
  const [mode, setMode] = useState<"portrait" | "landscape">("portrait");
  const [recogMode, setRecogMode] = useState<
    "number" | "face" | "both" | "qr" | "qr_number"
  >(() => {
    if (typeof window === "undefined") return "number";
    const v = localStorage.getItem("crm_touch_recog_mode");
    return v === "face" || v === "both" || v === "qr" || v === "qr_number" ? v : "number";
  });
  // 선택한 출석 모드 유지 (새로고침해도 초기화되지 않도록)
  useEffect(() => {
    try {
      localStorage.setItem("crm_touch_recog_mode", recogMode);
    } catch {
      /* ignore */
    }
  }, [recogMode]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 얼굴 미등록 회원 체크인 시 '사진 촬영 권유' 여부 (터치출석 설정 photo_suggest_enabled)
  const [photoSuggest, setPhotoSuggest] = useState(true);

  // 가로/세로 레이아웃 기억
  useEffect(() => {
    const saved = localStorage.getItem("crm_touch_orientation");
    if (saved === "landscape" || saved === "portrait") setMode(saved);
  }, []);
  const toggleMode = () => {
    setMode((m) => {
      const next = m === "portrait" ? "landscape" : "portrait";
      localStorage.setItem("crm_touch_orientation", next);
      return next;
    });
  };
  const landscape = mode === "landscape";

  // 실제 '보이는' 높이에 정확히 맞춤. 태블릿 크롬 앱은 주소창 때문에 100dvh 가
  // 실제 표시 영역보다 커져 하단(QR·출석 버튼)이 잘리므로, visualViewport 로 측정.
  const [vpH, setVpH] = useState<number | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const update = () => setVpH(vv?.height ?? window.innerHeight);
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // 센터명 로드 (상단 표시용)
  useEffect(() => {
    (async () => {
      try {
        if (kiosk) {
          const res = await fetch(`/api/touch/${kioskToken}/bootstrap`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            setCenterName(data.centerName ?? "");
          } else {
            setCenterName("__invalid__");
          }
          return;
        }
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setCenterName(data.centerName ?? "");
          setPhotoSuggest(data.photoSuggestEnabled !== false);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken, kiosk, kioskToken]);

  const reset = useCallback(() => {
    setNum("");
    setCandidates(null);
    setEnrollTarget(null);
    setBusy(false);
  }, []);

  // 에러 토스트만 자동 사라짐(3.5초). 성공은 CheckinResultScreen 이 카운트다운 자체 관리.
  useEffect(() => {
    if (!result || result.kind !== "error") return;
    const t = setTimeout(() => {
      setResult(null);
      reset();
    }, 3500);
    return () => clearTimeout(t);
  }, [result, reset]);

  // QR 출석 감지 폴링: 회원앱으로 QR을 스캔해 출석하면(source='app') 태블릿엔 결과창이
  // 안 뜬다. QR 표시 모드일 때 새 QR 출석을 폴링해, 번호출석과 '동일한' 결과창을 띄운다.
  const qrPollCursor = useRef<number | null>(null);
  useEffect(() => {
    const active = recogMode === "qr" || recogMode === "qr_number";
    if (!active) {
      qrPollCursor.current = null;
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const cursor = qrPollCursor.current;
        const qs = cursor != null ? `?since=${cursor}` : "";
        let res: Response;
        if (kiosk) {
          res = await fetch(`/api/touch/${kioskToken}/recent-checkin${qs}`, { cache: "no-store" });
        } else {
          const t = await getIdToken();
          if (!t) throw new Error("no-auth");
          res = await fetch(`/api/crm/kiosk-recent-checkin${qs}`, {
            headers: { authorization: `Bearer ${t}` },
            cache: "no-store",
          });
        }
        const d = await res.json();
        if (stopped) return;
        if (qrPollCursor.current == null) {
          // 최초 응답 = baseline. 기존 출석은 표시하지 않고 커서만 잡는다.
          qrPollCursor.current = typeof d.latestId === "number" ? d.latestId : 0;
        } else if (d.checkin && d.checkin.attendance_id > qrPollCursor.current) {
          qrPollCursor.current = d.checkin.attendance_id;
          const c = d.checkin;
          setResult({
            kind: "success",
            name: c.member?.name ?? "",
            birth: c.member?.birth ?? null,
            phone: c.member?.phone ?? null,
            photo: c.member?.face_thumb ?? null,
            duplicate: !!c.duplicate,
            mileageAwarded: c.mileage_awarded ?? 0,
            summary: c.summary as CheckinSummary | undefined,
          });
          if (!c.duplicate) {
            if (c.summary && c.summary.can_enter === false) playWarningBeep();
            else playCheckinChime();
          }
          speakMessages(Array.isArray(c.voice_messages) ? c.voice_messages : []);
        } else if (typeof d.latestId === "number" && d.latestId > qrPollCursor.current) {
          // 회원 조회 실패 등으로 결과 미구성 → 커서만 전진(재표시 방지)
          qrPollCursor.current = d.latestId;
        }
      } catch {
        /* 네트워크 오류 무시 — 다음 폴링에서 재시도 */
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [recogMode, kiosk, kioskToken, getIdToken]);

  const press = (d: string) => {
    if (busy || candidates || enrollTarget) return;
    primeSpeech(); // 사용자 제스처에서 음성 잠금 해제 (이후 await 뒤 재생 보장)
    primeAudio(); // 확인음/경고음 오디오도 제스처에서 잠금 해제 (맥/크롬 필수)
    setResult(null);
    setNum((v) => (v.length >= 10 ? v : v + d));
  };
  const backspace = () => {
    if (busy || candidates || enrollTarget) return;
    setNum((v) => v.slice(0, -1));
  };
  const clearAll = () => {
    if (busy) return;
    setNum("");
    setCandidates(null);
    setEnrollTarget(null);
    setResult(null);
  };

  const checkin = async (member: MemberLite) => {
    if (busy) return;
    primeSpeech(); // 출석 실행 탭(제스처) 시점에 음성 잠금 해제
    primeAudio();
    setBusy(true);
    setResult(null);
    try {
      const res = kiosk
        ? await fetch(`/api/touch/${kioskToken}/check-in`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ member_id: member.id }),
          })
        : await fetch("/api/crm/attendances/check-in", {
            method: "POST",
            headers: {
              authorization: `Bearer ${await getIdToken()}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ member_id: member.id, source: "touch_number" }),
          });
      const data = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: data?.error || "출석 실패" });
      } else {
        setResult({
          kind: "success",
          name: data.member?.name ?? member.name,
          birth: data.member?.birth ?? null,
          phone: data.member?.phone ?? member.phone ?? null,
          photo: data.member?.face_thumb ?? member.face_thumb ?? null,
          duplicate: data.duplicate,
          mileageAwarded: data.mileage_awarded ?? 0,
          summary: data.summary as CheckinSummary | undefined,
        });
        // 출석 성공 소리: 입장 불가(유효 이용권 없음)=경고음, 정상=확인음. (TTS 무관하게 항상 소리)
        const hasVoice = Array.isArray(data.voice_messages) && data.voice_messages.length > 0;
        if (!data.duplicate) {
          if (data.summary && data.summary.can_enter === false) playWarningBeep();
          else playCheckinChime();
        } else if (hasVoice) {
          // 중복이라도 안내(만료 회원 반복 출석 등)가 있으면 경고음
          playWarningBeep();
        }
        // 서버에서 매칭된 음성 안내(만료 회원·만료 임박 등) 재생 — 중복 출석도 포함
        speakMessages(hasVoice ? (data.voice_messages as string[]) : []);
      }
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : "네트워크 오류" });
    } finally {
      setBusy(false);
      setCandidates(null);
      setNum("");
    }
  };

  const submit = async () => {
    if (busy || !num.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = kiosk
        ? await fetch(`/api/touch/${kioskToken}/by-number?no=${encodeURIComponent(num.trim())}`, {
            cache: "no-store",
          })
        : await fetch(`/api/crm/attendances/by-number?no=${encodeURIComponent(num.trim())}`, {
            headers: { authorization: `Bearer ${await getIdToken()}` },
            cache: "no-store",
          });
      const data = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: data?.error || "조회 실패" });
        setBusy(false);
        return;
      }
      const members: MemberLite[] = data.members ?? [];
      if (members.length === 0) {
        setResult({ kind: "error", message: `출석번호 ${num.trim()} 회원을 찾을 수 없어요.` });
        setBusy(false);
        setNum("");
      } else if (members.length === 1) {
        const m = members[0];
        if (kiosk || m.has_face || !photoSuggest) {
          // 공개 키오스크(번호 전용) / 이미 얼굴 등록 / 사진 촬영 권유 OFF → 바로 체크인
          await checkin(m);
        } else {
          // 얼굴 미등록 + 사진 촬영 권유 ON → 촬영/동의 플로우
          setEnrollTarget(m);
          setBusy(false);
        }
      } else {
        // 동명(같은 번호) 여러 명 → 이름 선택
        setCandidates(members);
        setBusy(false);
      }
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : "네트워크 오류" });
      setBusy(false);
    }
  };

  const display = (
    <div className="h-[clamp(66px,11vmin,140px)] rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center leading-none">
      {num ? (
        <span className="text-[clamp(32px,6.5vmin,80px)] font-bold tracking-[0.2em] text-[#2A251D] dark:text-zinc-100 leading-none">
          {num}
        </span>
      ) : (
        <span className="text-[#C9BEA6] tracking-normal text-[clamp(18px,3vmin,34px)] font-medium leading-none">
          출석번호
        </span>
      )}
    </div>
  );
  const keypad = (
    <div className="grid grid-cols-3 gap-[clamp(8px,1.6vmin,20px)]">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <KeyBtn key={d} onClick={() => press(d)}>{d}</KeyBtn>
      ))}
      <KeyBtn onClick={backspace} variant="muted">←</KeyBtn>
      <KeyBtn onClick={() => press("0")}>0</KeyBtn>
      <KeyBtn onClick={clearAll} variant="muted">지움</KeyBtn>
    </div>
  );
  const submitBtn = (
    <button
      onClick={submit}
      disabled={busy || !num.trim()}
      className={`w-full rounded-2xl bg-[#6B7B3A] text-white text-[clamp(18px,3.4vmin,38px)] font-bold hover:bg-[#5a6932] disabled:opacity-40 ${
        landscape ? "flex-1 py-[clamp(20px,5vmin,60px)]" : "py-[clamp(16px,2.8vmin,34px)]"
      }`}
    >
      {busy ? "처리 중…" : "출석하기"}
    </button>
  );

  if (kiosk && centerName === "__invalid__") {
    return (
      <div
        className="min-h-dvh flex items-center justify-center px-6 text-center bg-[#FEFCF7] dark:bg-zinc-950"
        style={{ marginTop: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px))" }}
      >
        <div>
          <div className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            유효하지 않은 링크예요
          </div>
          <p className="mt-2 text-[13px] text-[#8C8270] dark:text-zinc-400">
            링크가 만료됐거나 잘못됐어요. 센터 관리자에게 새 링크를 요청해 주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-[100dvh] overflow-hidden flex flex-col items-center px-5 bg-[#FEFCF7] dark:bg-zinc-950"
      // 루트 레이아웃 body 의 상단 NavBar 여백(56px) 상쇄 - 상단부터 센터명만 표시.
      // height 는 측정된 visualViewport 높이로 덮어써 실제 표시 영역에 정확히 맞춤(100dvh 폴백).
      style={{
        marginTop: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px))",
        ...(vpH ? { height: `${vpH}px` } : null),
      }}
    >
      {/* 센터명 상단바 + 가로/세로 전환 */}
      <div
        className="shrink-0 relative w-full border-b border-[#E8E0D0] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 text-center py-3 mb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <span className="text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">
          {centerName || " "}
        </span>
        <button
          onClick={toggleMode}
          className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:border-[#6B7B3A]/50"
          title="가로형 / 세로형 전환"
        >
          <OrientationIcon landscape={landscape} />
          {landscape ? "세로형" : "가로형"}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[#6B5D47] dark:text-zinc-300 hover:border-[#6B7B3A]/50"
          title="출석 모드 설정"
          aria-label="출석 모드 설정"
        >
          <GearIcon />
        </button>
      </div>

      <header className="shrink-0 mb-2 text-center">
        <h1 className="text-[clamp(20px,3.4vmin,30px)] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight">
          터치 출석
        </h1>
        {/* 세로형에서만 안내문 표시(가로형은 공간 절약) */}
        {!landscape && (
          <p className="mt-1 text-[14px] text-[#6B5D47] dark:text-zinc-400">
            {recogMode === "number"
              ? "출석번호를 누르고 출석하기를 눌러 주세요."
              : recogMode === "face"
                ? "얼굴을 카메라에 비추면 자동으로 출석돼요."
                : recogMode === "qr"
                  ? "회원 앱으로 화면의 QR을 스캔하면 출석돼요."
                  : recogMode === "qr_number"
                    ? "QR을 앱으로 스캔하거나 출석번호를 눌러 출석해 주세요."
                    : "출석번호를 눌러 출석하거나 얼굴을 카메라에 비추면 자동으로 출석돼요."}
          </p>
        )}
      </header>

      {/* 콘텐츠 영역: 남은 화면을 꽉 채우고 창 크기에 맞춰 자동 정렬(가로/세로) */}
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-y-auto pb-3">
      {recogMode === "face" ? (
        <FaceAttendance kioskToken={kioskToken} />
      ) : (
        <>
      {/* 결과 화면 (에러는 상단 토스트, 성공은 전체 화면 카드) */}
      {result && result.kind === "error" && (
        <div
          className={`mb-5 w-full px-5 py-4 rounded-2xl border-2 text-center border-red-300 bg-red-50 text-red-700 ${
            landscape ? "max-w-[min(96vw,1120px)]" : "max-w-[min(92vw,560px)]"
          }`}
        >
          <div className="text-[16px] font-semibold">{result.message}</div>
        </div>
      )}
      {result && result.kind === "success" && (
        <CheckinResultScreen
          data={result}
          preview={previewMode}
          onClose={() => {
            setResult(null);
            reset();
          }}
        />
      )}

      {enrollTarget ? (
        /* 얼굴 미등록 단일 회원 → 동의·촬영 */
        <FaceEnroll
          member={enrollTarget}
          onCancel={clearAll}
          onDone={async () => {
            const m = enrollTarget;
            setEnrollTarget(null);
            await checkin(m);
          }}
        />
      ) : candidates ? (
        /* 동일 번호 여러 명 → 이름 선택 (크게 표시해 잘 보이고 누르기 쉽게) */
        <div className={`w-full ${landscape ? "max-w-[min(98vw,1200px)]" : "max-w-[min(96vw,720px)]"}`}>
          <div className="mb-5 text-center text-[clamp(20px,3vmin,30px)] font-bold text-[#2A251D] dark:text-zinc-100">
            본인 이름을 선택해 주세요
          </div>
          <ul className={landscape ? "grid grid-cols-2 gap-4" : "space-y-4"}>
            {candidates.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => checkin(m)}
                  disabled={busy}
                  className="w-full px-7 py-6 rounded-3xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-left hover:border-[#6B7B3A] active:bg-[#F5F0E5] dark:active:bg-zinc-800 disabled:opacity-50"
                >
                  <div className="text-[clamp(26px,4vmin,40px)] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight">
                    {m.name}
                  </div>
                  <div className="mt-2 text-[clamp(16px,2.2vmin,22px)] text-[#6B5D47] dark:text-zinc-400 flex flex-wrap gap-x-3">
                    {m.phone && <span className="tabular-nums font-semibold">{formatPhone(m.phone)}</span>}
                    {m.birth && <span className="text-[#A89B80]">· 생년월일 {m.birth}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={clearAll}
            className="mt-6 w-full px-4 py-5 rounded-3xl border-2 border-[#E8E0D0] dark:border-zinc-700 text-[clamp(17px,2.4vmin,24px)] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            취소
          </button>
        </div>
      ) : recogMode === "qr" ? (
        /* QR 출석: 키오스크가 QR 표시 → 회원 앱으로 스캔해 출석 */
        <div className="w-full flex items-center justify-center">
          <QrDisplay kioskToken={kioskToken} />
        </div>
      ) : recogMode === "qr_number" ? (
        /* QR/번호: QR 표시 + 키패드 동시 노출. QR은 남는 높이를 채우고 키패드는
           항상 보이도록 고정 → 위아래 잘림 없이 창 높이에 자동 맞춤. */
        landscape ? (
          <div className="w-full h-full min-h-0 max-w-[98vw] flex flex-row items-stretch gap-[clamp(12px,2.5vmin,32px)]">
            <div className="flex-1 min-w-0 min-h-0">
              <QrDisplay kioskToken={kioskToken} fit />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-[clamp(10px,2vmin,24px)]">
              {display}
              {keypad}
              {submitBtn}
            </div>
          </div>
        ) : (
          <div className="w-full h-full min-h-0 max-w-[96vw] flex flex-col gap-[clamp(8px,1.6vmin,18px)]">
            <div className="flex-1 min-h-0 w-full">
              <QrDisplay kioskToken={kioskToken} fit />
            </div>
            <div className="shrink-0 w-full pt-[clamp(8px,1.5vmin,16px)] border-t border-[#E8E0D0] dark:border-zinc-700">
              <div className="mb-[clamp(8px,1.5vmin,16px)]">{display}</div>
              {keypad}
              <div className="mt-[clamp(8px,1.5vmin,16px)]">{submitBtn}</div>
            </div>
          </div>
        )
      ) : recogMode === "both" ? (
        /* 번호+얼굴 모드: 얼굴 카메라 + 키패드 동시 노출 (어느 쪽이든 먼저 완료되는 방식으로 출석).
           카메라는 남는 높이를 채우고 키패드는 항상 보이도록 고정 → 위아래 자동 맞춤. */
        landscape ? (
          <div className="w-full h-full min-h-0 max-w-[98vw] flex flex-row items-stretch gap-[clamp(12px,2.5vmin,32px)]">
            <div className="flex-1 min-w-0 min-h-0">
              <FaceAttendance fill kioskToken={kioskToken} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-[clamp(10px,2vmin,24px)]">
              {display}
              {keypad}
              {submitBtn}
            </div>
          </div>
        ) : (
          <div className="w-full h-full min-h-0 max-w-[96vw] flex flex-col gap-[clamp(8px,1.6vmin,18px)]">
            <div className="flex-1 min-h-0 w-full">
              <FaceAttendance fill kioskToken={kioskToken} />
            </div>
            <div className="shrink-0 w-full pt-[clamp(8px,1.5vmin,16px)] border-t border-[#E8E0D0] dark:border-zinc-700">
              <div className="mb-[clamp(8px,1.5vmin,16px)]">{display}</div>
              {keypad}
              <div className="mt-[clamp(8px,1.5vmin,16px)]">{submitBtn}</div>
            </div>
          </div>
        )
      ) : landscape ? (
        /* 가로형: 좌 키패드 / 우 표시·출석하기 */
        <div className="w-full max-w-[min(96vw,1120px)] flex flex-row items-stretch gap-[clamp(16px,4vmin,56px)]">
          <div className="w-[min(46vw,520px)] shrink-0">{keypad}</div>
          <div className="flex-1 flex flex-col justify-center gap-[clamp(12px,2.5vmin,28px)]">
            {display}
            {submitBtn}
          </div>
        </div>
      ) : (
        /* 세로형: 표시 → 키패드 → 출석하기 */
        <div className="w-full max-w-[min(92vw,560px)]">
          <div className="mb-[clamp(12px,2vmin,24px)]">{display}</div>
          {keypad}
          <div className="mt-[clamp(10px,1.8vmin,22px)]">{submitBtn}</div>
        </div>
      )}
        </>
      )}
      </div>

      {/* 설정: 출석 모드 선택 */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">출석 모드 설정</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="w-8 h-8 rounded-lg text-[#8C8270] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 flex items-center justify-center"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="text-[12.5px] text-[#8C8270] dark:text-zinc-500 mb-2">출석 방식</div>
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  { k: "number", label: "번호 출석", desc: "출석번호를 눌러 출석" },
                  { k: "face", label: "얼굴 출석", desc: "얼굴 인식으로 자동 출석" },
                  { k: "both", label: "번호 + 얼굴", desc: "번호·얼굴 둘 다 사용" },
                  { k: "qr", label: "QR 출석", desc: "화면 QR을 회원 앱으로 스캔" },
                  { k: "qr_number", label: "QR + 번호", desc: "QR 표시 + 번호 키패드" },
                ] as const
              ).map(({ k, label, desc }) => {
                const active = recogMode === k;
                return (
                  <button
                    key={k}
                    onClick={() => {
                      primeSpeech();
                      primeAudio();
                      setRecogMode(k);
                      setSettingsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      active
                        ? "border-[#6B7B3A] bg-[#6B7B3A]/8 dark:bg-[#6B7B3A]/20"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[15px] font-semibold ${active ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#2A251D] dark:text-zinc-100"}`}>
                        {label}
                      </span>
                      {active && <span className="text-[#6B7B3A] dark:text-[#A8B87A] text-[15px]">✓</span>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">{desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function OrientationIcon({ landscape }: { landscape: boolean }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      {landscape ? (
        <rect x="3" y="6" width="18" height="12" rx="2" />
      ) : (
        <rect x="6" y="3" width="12" height="18" rx="2" />
      )}
    </svg>
  );
}

function KeyBtn({
  children,
  onClick,
  variant = "num",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "num" | "muted";
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[clamp(56px,10vmin,128px)] rounded-2xl text-[clamp(22px,4.2vmin,46px)] font-bold select-none active:scale-95 transition-transform
        ${variant === "muted"
          ? "bg-[#F1EADB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300 !text-[clamp(15px,2.8vmin,30px)]"
          : "bg-white dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 text-[#2A251D] dark:text-zinc-100 hover:border-[#6B7B3A]"
        }`}
    >
      {children}
    </button>
  );
}

/** 뒷자리만 노출: 010-1234-**** */
function maskPhone(phone: string): string {
  const f = formatPhone(phone);
  const parts = f.split("-");
  if (parts.length === 3) return `${parts[0]}-${parts[1]}-****`;
  return f;
}

function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}*${name.slice(-1)}`;
}

function maskPhoneMiddle(phone: string | null): string {
  if (!phone) return "-";
  const f = formatPhone(phone);
  const parts = f.split("-");
  if (parts.length !== 3) return f;
  const mid = parts[1];
  const last = parts[2];
  const midMasked = mid.length >= 4 ? mid.slice(0, 2) + "*".repeat(mid.length - 2) : mid;
  const lastMasked = last.length >= 4 ? last.slice(0, 2) + "*".repeat(last.length - 2) : last;
  return `${parts[0]}-${midMasked}-${lastMasked}`;
}

const DOW_KOR = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 체크인 성공 시 회원과 함께 있는 자리에서 보여주는 전체화면 결과 카드.
 * - 입장 가/불가 시각적 구분
 * - 회원 이름·연락처 마스킹 표시
 * - 유효 이용권/락커/대여권 요약
 * - 이번 주 출석 요일 뱃지
 * - 3초 카운트다운 후 자동 닫힘 (X / 처음으로 돌아가기 클릭 시 즉시)
 */
function CheckinResultScreen({
  data,
  onClose,
  preview,
}: {
  data: {
    kind: "success";
    name: string;
    birth: string | null;
    phone: string | null;
    photo?: string | null;
    duplicate?: boolean;
    mileageAwarded?: number;
    summary?: CheckinSummary;
  };
  onClose: () => void;
  preview?: boolean; // true 면 자동 닫힘 없이 화면 유지(디자인 미리보기용)
}) {
  const [remain, setRemain] = useState(3);
  useEffect(() => {
    if (preview) return; // 미리보기 모드에서는 카운트다운/자동닫힘 안 함
    if (remain <= 0) {
      onClose();
      return;
    }
    const t = setTimeout(() => setRemain((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [remain, onClose, preview]);

  const s = data.summary;
  // 입장 가능 판정: summary 없으면 성공 자체를 가능으로 간주 (하위 호환)
  const canEnter = s ? s.can_enter : true;
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayDow = nowKst.getUTCDay();

  // 보유 이용권 카드 — 만료일 대신 D-day 를 크게 표시. 세로/가로 배치에 재사용.
  const holdingsCard = (
    <div className="rounded-2xl bg-[#1E2024] p-5 md:p-7 min-h-[180px] flex flex-col">
      <div className="text-[13px] text-white/60 mb-3 font-semibold">보유 이용권</div>
      {!s || (s.memberships.length === 0 && s.passes.length === 0) ? (
        <div className="flex-1 flex items-center justify-center text-white/50 text-[14.5px]">
          보유하신 이용권이 없습니다
        </div>
      ) : (
        <ul className="space-y-2">
          {s.memberships.map((m) => (
            <li key={`m${m.id}`} className="px-3.5 py-3 rounded-lg bg-white/[0.04] border border-white/10">
              <div className="text-[16px] font-bold truncate">
                {m.plan_name}
                {m.is_paused && <span className="ml-2 text-[11px] text-amber-300">홀딩중</span>}
              </div>
              <div className="mt-1 text-[22px] font-extrabold text-emerald-300 leading-none tabular-nums">
                {ddayLabel(m.expires_at)}
              </div>
            </li>
          ))}
          {s.passes.map((p) => (
            <li key={`p${p.id}`} className="px-3.5 py-3 rounded-lg bg-white/[0.04] border border-white/10">
              <div className="text-[16px] font-bold truncate">
                {p.lesson_kind}
                {p.is_paused && <span className="ml-2 text-[11px] text-amber-300">홀딩중</span>}
              </div>
              <div className="mt-1 flex items-baseline gap-2.5 flex-wrap">
                <span className="text-[22px] font-extrabold text-emerald-300 leading-none tabular-nums">
                  {ddayLabel(p.expires_at)}
                </span>
                <span className="text-[20px] font-bold text-white leading-none tabular-nums">
                  잔여 {p.remaining_sessions}/{p.total_sessions}회
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-[#111214] text-white flex items-center justify-center px-4 py-6 overflow-y-auto">
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-5 right-5 w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 text-white/80"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="w-full max-w-[1180px] grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* 좌측: 상태 + 회원 카드 + 이번 주 출석 */}
        <div className="rounded-2xl bg-[#1E2024] p-5 md:p-7 space-y-5">
          {/* 상태 표시 */}
          <div className="flex flex-col items-center">
            {canEnter ? (
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" transform="rotate(45 12 12)" />
                </svg>
              </div>
            )}
            <div className="mt-3 text-[26px] md:text-[30px] font-bold">
              {canEnter ? (
                data.duplicate ? (
                  <>
                    이미 <span className="text-amber-400">출석</span>했어요
                  </>
                ) : (
                  <>
                    입장이 <span className="text-emerald-400">완료</span>됐어요
                  </>
                )
              ) : (
                <>
                  입장이 <span className="text-red-400">불가</span>합니다
                </>
              )}
            </div>
            {s?.not_started && (
              <div className="mt-3 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[15px] md:text-[17px] font-semibold text-center">
                아직 출석시작일이 아닙니다
              </div>
            )}
          </div>

          {/* 회원 카드 */}
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl text-white/50 overflow-hidden shrink-0 border border-white/15">
                {data.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-[24px] font-bold">{maskName(data.name)}</div>
                <div className="flex gap-x-4 text-[13px] text-white/60">
                  <span>생년월일</span>
                  <span className="text-white/90 tabular-nums">
                    {data.birth ? data.birth : "-"}
                  </span>
                </div>
                <div className="flex gap-x-4 text-[13px] text-white/60">
                  <span>연락처</span>
                  <span className="text-white/90 tabular-nums">{maskPhoneMiddle(data.phone)}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2.5">
              <span className="text-white/60 text-[15px]">누적 마일리지</span>
              <span className="text-[24px] font-bold text-white tabular-nums leading-none">
                {(s?.mileage ?? 0).toLocaleString()}
              </span>
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                M
              </span>
            </div>
          </div>

          {/* 이번 주 출석 */}
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center gap-2 text-[13px] text-white/70 mb-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M8 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-3M8 3v4h8V3M8 3h8" />
              </svg>
              <span className="font-semibold">출석 현황</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 md:gap-2">
              {DOW_KOR.map((d, i) => {
                const present = s?.week_present[i] ?? false;
                const isToday = i === todayDow;
                return (
                  <div key={d} className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                        present
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                          : "bg-white/5 border-white/15 text-white/40"
                      }`}
                    >
                      {present ? "✓" : "·"}
                    </div>
                    <div
                      className={`text-[12px] ${
                        i === 0 ? "text-red-400" : i === 6 ? "text-sky-400" : "text-white/60"
                      } ${isToday ? "font-bold" : ""}`}
                    >
                      {isToday ? "Today" : d}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-[11px] text-white/40 text-right">
              (주간) 매주 월요일 · (월간) 매월 1일 초기화
            </div>
          </div>

          {/* 세로 화면: 보유 이용권을 '출석 현황' 바로 아래에 표시 (가로에서는 우측에 표시) */}
          <div className="md:hidden">{holdingsCard}</div>
        </div>

        {/* 우측: 이용권/락커/대여권 */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard
              icon="👕"
              title="대여권"
              value={
                s && s.rentals.length > 0
                  ? ddayLabel(s.rentals.reduce((a, x) => (x.expires_at > a ? x.expires_at : a), ""))
                  : "사용 안 함"
              }
              muted={!s || s.rentals.length === 0}
              strong={!!s && s.rentals.length > 0}
            />
            <SummaryCard
              icon="🔒"
              title="락커"
              value={
                s && s.lockers.length > 0
                  ? ddayLabel(s.lockers.reduce((a, x) => (x.expires_at > a ? x.expires_at : a), ""))
                  : "사용 안 함"
              }
              muted={!s || s.lockers.length === 0}
              strong={!!s && s.lockers.length > 0}
            />
          </div>

          {/* 가로(태블릿)에서만 우측에 표시 — 세로에서는 '출석 현황' 아래로 이동 */}
          <div className="hidden md:block">{holdingsCard}</div>

          {/* 카운트다운 처음으로 */}
          <button
            type="button"
            onClick={onClose}
            className="w-full px-5 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-[16px] font-bold flex items-center justify-center gap-3"
          >
            <span className="w-8 h-8 rounded-full bg-white text-[#111214] flex items-center justify-center font-extrabold">
              {remain}
            </span>
            처음으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  muted,
  strong,
}: {
  icon: string;
  title: string;
  value: string;
  muted?: boolean;
  strong?: boolean; // true 면 이용권 D-day 와 동일 스타일(22px, emerald, extrabold)
}) {
  return (
    <div className="rounded-2xl bg-[#1E2024] px-4 py-4 md:px-5 md:py-5 min-h-[104px]">
      <div className="flex items-center gap-1.5 text-[13px] text-white/70">
        <span>{icon}</span>
        <span className="font-semibold">{title}</span>
      </div>
      <div
        className={`mt-2 truncate ${
          muted
            ? "text-[18px] md:text-[20px] font-bold text-white/50"
            : strong
              ? "text-[22px] font-extrabold text-emerald-300 tabular-nums"
              : "text-[18px] md:text-[20px] font-bold text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** 만료일 → D-day 라벨 (KST). 무기한/만료/오늘/D-N. */
function ddayLabel(ymd: string): string {
  if (!ymd) return "-";
  if (ymd.startsWith("9999") || ymd.startsWith("2999")) return "무기한";
  const nowYmd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const t = new Date(`${ymd.slice(0, 10)}T00:00:00+09:00`).getTime();
  const n = new Date(`${nowYmd}T00:00:00+09:00`).getTime();
  const d = Math.round((t - n) / 86400000);
  if (d < 0) return "만료됨";
  if (d === 0) return "오늘 만료";
  return `D-${d}일 남음`;
}
