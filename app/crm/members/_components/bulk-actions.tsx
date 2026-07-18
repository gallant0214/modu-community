"use client";

import { useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, crmInputClass } from "../../_components/crm-modal";

type Action = "hold" | "extend" | "message" | "mileage";

function todayYmd(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 회원 리스트 일괄 작업 바 + 모달.
 * 선택한 회원들에게 홀딩 / 기간 연장 / 메시지 / 마일리지 지급·차감을 적용.
 * 홀딩·연장은 각 회원의 유효 이용권(회원권+수강권+대여권) 전체에 적용.
 */
export function BulkActionBar({
  selectedIds,
  onDone,
  onCancel,
}: {
  selectedIds: number[];
  /** 작업 성공 후 호출 (요약 메시지 전달). 리스트 새로고침 용도. */
  onDone: (summary: string) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const count = selectedIds.length;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#6B7B3A]/40 bg-[#6B7B3A]/8 px-3 py-2">
      <span className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
        {count}명 선택됨
      </span>
      <span className="mx-1 h-4 w-px bg-[#6B7B3A]/30" />
      <BulkBtn disabled={count === 0} onClick={() => setAction("hold")}>일괄 홀딩</BulkBtn>
      <BulkBtn disabled={count === 0} onClick={() => setAction("extend")}>기간 연장</BulkBtn>
      <BulkBtn disabled={count === 0} onClick={() => setAction("message")}>메시지 보내기</BulkBtn>
      <BulkBtn disabled={count === 0} onClick={() => setAction("mileage")}>마일리지</BulkBtn>
      <button
        onClick={onCancel}
        className="ml-auto px-3 py-1.5 rounded-full text-[12.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
      >
        선택 해제
      </button>

      {action && (
        <BulkActionModal
          action={action}
          selectedIds={selectedIds}
          onClose={() => setAction(null)}
          onDone={(summary) => {
            setAction(null);
            onDone(summary);
          }}
        />
      )}
    </div>
  );
}

function BulkBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold border border-[#6B7B3A] bg-[#6B7B3A] text-white hover:bg-[#5a6932] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

const TITLES: Record<Action, string> = {
  hold: "일괄 홀딩",
  extend: "기간 연장",
  message: "메시지 보내기",
  mileage: "마일리지 지급 / 차감",
};

function BulkActionModal({
  action,
  selectedIds,
  onClose,
  onDone,
}: {
  action: Action;
  selectedIds: number[];
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const { getIdToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // hold
  const [holdStart, setHoldStart] = useState(todayYmd());
  const [holdEnd, setHoldEnd] = useState(todayYmd());
  const [holdReason, setHoldReason] = useState("");
  // extend
  const [extendDays, setExtendDays] = useState(30);
  const [extendReason, setExtendReason] = useState("");
  // message
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  // mileage
  const [mileageMode, setMileageMode] = useState<"give" | "deduct">("give");
  const [mileageAmount, setMileageAmount] = useState(0);
  const [mileageReason, setMileageReason] = useState("");

  const submit = async () => {
    setError("");

    // 클라이언트 검증
    if (action === "hold") {
      if (!holdStart || !holdEnd) return setError("시작일과 종료일을 입력해 주세요");
      if (holdEnd < holdStart) return setError("종료일이 시작일보다 빠를 수 없어요");
    }
    if (action === "extend" && (!extendDays || extendDays === 0)) {
      return setError("연장 일수를 입력해 주세요");
    }
    if (action === "message") {
      if (!msgTitle.trim()) return setError("메시지 제목을 입력해 주세요");
      if (!msgBody.trim()) return setError("메시지 내용을 입력해 주세요");
    }
    if (action === "mileage" && (!mileageAmount || mileageAmount <= 0)) {
      return setError("마일리지 금액을 입력해 주세요");
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

      let url = "";
      let payload: Record<string, unknown> = {};
      if (action === "hold") {
        url = "/api/crm/members/bulk/hold";
        payload = {
          member_ids: selectedIds,
          start_date: holdStart,
          end_date: holdEnd,
          reason: holdReason.trim() || undefined,
        };
      } else if (action === "extend") {
        url = "/api/crm/members/bulk/extend";
        payload = { member_ids: selectedIds, days: extendDays, reason: extendReason.trim() || undefined };
      } else if (action === "mileage") {
        url = "/api/crm/members/bulk/mileage";
        payload = {
          member_ids: selectedIds,
          amount: mileageMode === "give" ? mileageAmount : -mileageAmount,
          reason: mileageReason.trim() || undefined,
        };
      } else {
        url = "/api/crm/messages";
        payload = {
          audience_kind: "individual",
          member_ids: selectedIds,
          title: msgTitle.trim(),
          body: msgBody.trim(),
        };
      }

      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "처리 실패");

      let summary = "";
      if (action === "hold") {
        summary = `${data.members_affected}명 · 이용권 ${data.items_held}건 홀딩 완료 (${data.extended_days}일 연장)`;
        if (data.skipped > 0) summary += ` · 유효 이용권 없어 제외 ${data.skipped}명`;
      } else if (action === "extend") {
        summary = `${data.members_affected}명 · 이용권 ${data.items_extended}건 ${data.days}일 연장 완료`;
        if (data.skipped > 0) summary += ` · 유효 이용권 없어 제외 ${data.skipped}명`;
      } else if (action === "mileage") {
        summary = `${data.members_affected}명 마일리지 ${mileageMode === "give" ? "지급" : "차감"} 완료 (${Math.abs(
          data.amount
        ).toLocaleString()}P)`;
      } else {
        summary = `${data.recipient_count ?? selectedIds.length}명에게 메시지 발송 완료`;
      }
      onDone(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setSaving(false);
    }
  };

  return (
    <CrmModal open onClose={onClose} title={`${TITLES[action]} · ${selectedIds.length}명`}>
      <div className="space-y-3">
        {action === "hold" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>홀딩 시작일</Label>
                <input type="date" value={holdStart} onChange={(e) => setHoldStart(e.target.value)} className={crmInputClass} />
              </div>
              <div>
                <Label>홀딩 종료일</Label>
                <input type="date" value={holdEnd} min={holdStart} onChange={(e) => setHoldEnd(e.target.value)} className={crmInputClass} />
              </div>
            </div>
            <div>
              <Label>사유</Label>
              <input
                type="text"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="예: 부상, 장기 출장 등"
                className={crmInputClass}
              />
            </div>
            <p className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">
              각 회원의 유효한 회원권·수강권·대여권 전체에 홀딩이 적용되고, 홀딩 기간만큼 만료일이 자동 연장됩니다.
            </p>
          </>
        )}

        {action === "extend" && (
          <>
            <div>
              <Label>연장 일수</Label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={extendDays}
                  onChange={(e) => setExtendDays(Math.trunc(Number(e.target.value) || 0))}
                  className={crmInputClass}
                />
                <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">일</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[7, 14, 30, 60, 90].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setExtendDays(n)}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-medium border ${
                      extendDays === n
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    +{n}일
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>사유</Label>
              <input
                type="text"
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                placeholder="예: 시설 점검 보상, 프로모션 등"
                className={crmInputClass}
              />
            </div>
            <p className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">
              각 회원의 유효한 회원권·수강권·대여권 만료일이 입력한 일수만큼 연장됩니다.
            </p>
          </>
        )}

        {action === "message" && (
          <>
            <div>
              <Label>제목</Label>
              <input
                type="text"
                value={msgTitle}
                onChange={(e) => setMsgTitle(e.target.value)}
                placeholder="메시지 제목"
                className={crmInputClass}
                maxLength={60}
              />
            </div>
            <div>
              <Label>내용</Label>
              <textarea
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value.slice(0, 1000))}
                placeholder="회원에게 보낼 메시지를 입력해 주세요."
                rows={5}
                className={`${crmInputClass} resize-none`}
              />
              <div className="mt-1 text-right text-[11px] text-[#A89B80]">{msgBody.length} / 1000</div>
            </div>
            <p className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">
              선택한 회원들에게 발송됩니다. 회원 전용 앱이 출시되면 앱에서 이 메시지를 받아볼 수 있어요.
            </p>
          </>
        )}

        {action === "mileage" && (
          <>
            <div>
              <Label>구분</Label>
              <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
                {(["give", "deduct"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMileageMode(m)}
                    className={`px-4 py-2 text-[13px] font-medium ${
                      mileageMode === m
                        ? "bg-[#6B7B3A] text-white"
                        : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    {m === "give" ? "지급 (+)" : "차감 (−)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>{mileageMode === "give" ? "지급" : "차감"} 마일리지</Label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={mileageAmount || ""}
                  onChange={(e) => setMileageAmount(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                  placeholder="0"
                  className={`${crmInputClass} pr-9`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">P</span>
              </div>
            </div>
            <div>
              <Label>사유</Label>
              <input
                type="text"
                value={mileageReason}
                onChange={(e) => setMileageReason(e.target.value)}
                placeholder="예: 이벤트 적립, 오류 정정 등"
                className={crmInputClass}
              />
            </div>
            <p className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">
              선택한 회원 각각의 마일리지 잔고에 {mileageMode === "give" ? "더해집니다" : "차감됩니다"}. 잔고는 0 미만으로 내려가지 않아요.
            </p>
          </>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
          >
            {saving ? "처리 중…" : "적용"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">{children}</div>
  );
}
