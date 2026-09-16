/**
 * 고정지출 적용 시점 헬퍼.
 *
 * 고정지출은 '등록한 달부터' 정산에 반영된다(과거 달은 손대지 않음).
 * 라우트 파일은 핸들러 외 export 를 허용하지 않아 공용 헬퍼는 여기에 둔다.
 */

/** KST 이번 달 1일 (적용 시작월) */
export function kstMonthStart(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** KST 이번 달 말일 (삭제 시 이 달까지 적용) */
export function kstMonthEnd(): string {
  const d = new Date(`${kstMonthStart()}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** 지난 달 말일 (금액 변경 시 기존 행을 여기까지로 종료) */
export function kstPrevMonthEnd(): string {
  const d = new Date(`${kstMonthStart()}T00:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
