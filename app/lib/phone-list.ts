/**
 * 붙여넣은 명단(이름·날짜·금액 등이 섞인 원문)에서 전화번호만 뽑는다.
 * 공백·쉼표·세미콜론·줄바꿈으로 나눈 조각 중 숫자 9~11자리만, 중복 제거·입력 순서 유지.
 * 문자 전송 '직접 입력'과 쿠폰 발송 '전화번호로 입력'이 같이 쓴다 — 한쪽만 고쳐지지 않게 여기 한 곳.
 */
export function parsePhoneList(raw: string): string[] {
  return Array.from(
    new Set(
      (raw ?? "")
        .split(/[\s,;]+/)
        .map((x) => x.replace(/\D/g, ""))
        .filter((x) => x.length >= 9 && x.length <= 11)
    )
  );
}
