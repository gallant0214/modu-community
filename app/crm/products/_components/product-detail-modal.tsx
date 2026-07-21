"use client";

import { CrmModal } from "../../_components/crm-modal";
import { formatWon } from "../../_components/crm-labels";

export interface ProductDetail {
  id: number;
  type: string;
  billing_mode: "period" | "count";
  category: string | null;
  name: string;
  description: string | null;
  open_time: string | null;
  close_time: string | null;
  operating_days: number[];
  duration_value: number | null;
  duration_unit: string | null;
  service_days: number | null;
  total_sessions: number | null;
  pause_enabled: boolean;
  pause_days: number;
  pause_count?: number;
  price_won: number;
  vat_included: boolean;
  mileage_earn?: number;
  mileage_usable?: boolean;
  attendance_mileage_earn?: number;
  capacity: number;
  session_minutes: number;
  daily_check_in_limit?: number;
  daily_time_limit_enabled?: boolean;
  status: string;
}

const TYPE_LABEL: Record<string, string> = {
  membership: "회원권",
  group: "그룹 수업",
  personal: "개인 레슨",
  locker: "락커",
  apparel: "운동복",
  goods: "운동 용품",
};

const UNIT_LABEL: Record<string, string> = {
  month: "개월",
  day: "일",
  year: "년",
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  product: ProductDetail | null;
  typeLabel?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * 상품 상세 모달 (읽기 전용). 카드 클릭 시 열림.
 * 하단에 수정/삭제 버튼.
 */
export function ProductDetailModal({ product, typeLabel, onClose, onEdit, onDelete }: Props) {
  if (!product) return null;
  const p = product;
  const days = (p.operating_days ?? []).map((d) => DOW[d] ?? "").filter(Boolean);
  const daysText =
    days.length === 7 ? "매일" : days.length === 5 && !days.includes("일") && !days.includes("토") ? "평일" : days.join(", ");

  return (
    <CrmModal open onClose={onClose} title={p.name} size="lg">
      <div className="space-y-4">
        {/* 요약 */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#6B7B3A]/15 text-[#6B7B3A] border border-[#6B7B3A]/30">
            {typeLabel ?? TYPE_LABEL[p.type] ?? p.type}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400">
            {p.billing_mode === "period" ? "기간제" : "횟수제"}
          </span>
          {p.status !== "active" && (
            <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-zinc-200 text-zinc-700">
              {p.status}
            </span>
          )}
        </div>

        {/* 가격 */}
        <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-900/40 px-4 py-3">
          <div className="text-[11.5px] text-[#8C8270]">금액</div>
          <div className="mt-0.5 text-[22px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
            {formatWon(p.price_won)}원
            {p.vat_included && <span className="ml-2 text-[11.5px] font-normal text-[#A89B80]">부가세 포함</span>}
          </div>
        </div>

        {/* 종목 + 기간/횟수 */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="종목">{p.category || "—"}</Field>
          <Field label={p.billing_mode === "period" ? "이용 기간" : "이용 횟수"}>
            {p.billing_mode === "period"
              ? p.duration_value
                ? `${p.duration_value}${UNIT_LABEL[p.duration_unit ?? "month"] ?? ""}`
                : "무제한"
              : `${p.total_sessions ?? 0}회`}
          </Field>
          {p.billing_mode === "count" && (
            <Field label="유효 기간(일)">{p.service_days ?? 0}일</Field>
          )}
          {p.billing_mode === "period" && p.service_days ? (
            <Field label="서비스 기간(일)">{p.service_days}일</Field>
          ) : null}
          {(p.type === "personal" || p.type === "group") && (
            <Field label="수업 시간">{p.session_minutes}분</Field>
          )}
          {p.type === "group" && (
            <Field label="그룹 정원">{p.capacity}명</Field>
          )}
          <Field label="운영 요일">{daysText || "—"}</Field>
          <Field label="하루 이용 가능 시간">
            {p.daily_time_limit_enabled
              ? `${(p.open_time ?? "").slice(0, 5)} ~ ${(p.close_time ?? "").slice(0, 5)}`
              : "제한 없음"}
          </Field>
          <Field label="하루 출석 가능 횟수">{p.daily_check_in_limit ?? 1}회</Field>
          {p.pause_enabled && (
            <Field label="정지(휴회)">
              최대 {p.pause_days}일
              {p.pause_count ? ` · ${p.pause_count}회` : ""}
            </Field>
          )}
          {!!p.mileage_earn && p.mileage_earn > 0 && (
            <Field label="구매 적립 마일리지">{p.mileage_earn.toLocaleString()}P</Field>
          )}
          {!!p.attendance_mileage_earn && p.attendance_mileage_earn > 0 && (
            <Field label="출석 적립 마일리지">
              {p.attendance_mileage_earn.toLocaleString()}P
              <span className="text-[11.5px] text-[#A89B80] ml-1">(하루 1회)</span>
            </Field>
          )}
          <Field label="마일리지 사용">{p.mileage_usable === false ? "불가" : "가능"}</Field>
        </div>

        {/* 설명 */}
        {p.description && (
          <div>
            <div className="text-[12.5px] font-medium text-[#6B5D47] mb-1">상품 설명</div>
            <div className="whitespace-pre-wrap text-[13.5px] text-[#3A342A] dark:text-zinc-200 border border-[#E8E0D0] dark:border-zinc-800 rounded-lg px-3 py-2 bg-[#FEFCF7] dark:bg-zinc-900">
              {p.description}
            </div>
          </div>
        )}

        {/* 액션 */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E8E0D0] dark:border-zinc-800">
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800/60 text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            삭제
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
            >
              수정
            </button>
          </div>
        </div>
      </div>
    </CrmModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-0.5">{label}</div>
      <div className="text-[14px] font-medium text-[#2A251D] dark:text-zinc-100">{children}</div>
    </div>
  );
}
