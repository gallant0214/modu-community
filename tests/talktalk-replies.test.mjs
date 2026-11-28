import test from "node:test";
import assert from "node:assert/strict";
import { classify, dueReply, receive, replies, WAIT, GRACE } from "../app/lib/specialbody-talktalk.ts";

test("first question sets one deadline, including follow-up questions", () => {
  const first = receive(null, "greeting", 1000, "test");
  const next = receive(first, "day", 50_000, "test");
  assert.equal(next.due, 1000 + WAIT);
  assert.equal(dueReply(next, next.due - 1), null);
  assert.equal(dueReply(next, next.due), replies.day);
  assert.equal(dueReply(next, next.due + GRACE + 1), null);
});
test("staff-only, compound and closed conversations have no automatic answer", () => {
  const first = receive(null, "day", 0, "test");
  for (const kind of ["staff", "pt"]) {
    assert.equal(dueReply(receive(first, kind, 1, "test"), WAIT), null);
  }
  const closed = { ...first, status: "closed" };
  assert.equal(dueReply(receive(closed, "day", WAIT, "test"), WAIT + 1), null);
});
test("product qualifications and prices", () => {
  assert.equal(classify("주말 일일권에 운동복 포함돼요?"), "day");
  assert.equal(classify("30분 PT 가격이 어떻게 돼요?"), "staff");
  assert.equal(classify("PT 환불 되나요?"), "staff");
  assert.equal(classify("헬스 12개월 얼마예요?"), "staff");
  assert.equal(classify("신규 일반 PT 가격 문의드려요"), "pt");
  assert.equal(classify("재방문 리뷰 쓰면 7,900원인가요?"), "day");
  assert.match(replies.day, /현장 결제 15,000원, 네이버예약 일반 결제 13,500원/);
  assert.match(replies.day, /직전 일일권 이용 리뷰를 작성하셨다면 네이버예약에서 7,900원 상품을 선택/);
  for (const item of ["주말", "운동복", "수건", "샴푸", "린스", "바디워시", "바디로션", "폼클렌징"]) assert.ok(replies.day.includes(item));
});

test("PT prices and visit answers do not volunteer contract details", () => {
  for (const text of ["일반 PT 가격이 얼마인가요?", "세미 PT 10회 가격", "PT 방문 상담 원합니다"]) {
    const ticket = receive(null, classify(text), 0, "test");
    const reply = dueReply(ticket, WAIT);
    assert.ok(reply);
    assert.doesNotMatch(reply, /50분|30분|별도|환불|양도|취소|위약|차감/);
  }
});

test("direct questions and follow-ups get only the requested PT detail", () => {
  for (const [text, previous, expected] of [
    ["일반 PT 한 번에 몇 분인가요?", undefined, "ptTime"],
    ["세미 PT는 몇 분인가요?", undefined, "semiTime"],
    ["그럼 락커도 포함인가요?", "semi", "semiLocker"],
    ["헬스도 포함되나요?", "semiLocker", "semiGym"],
    ["개인 락커 포함인가요?", "pt", "ptLocker"],
    ["세미 PT 헬스와 락커 포함인가요?", undefined, "semiIncludes"],
  ]) {
    assert.equal(classify(text, previous), expected);
  }
  assert.doesNotMatch(replies.semiLocker, /헬스/);
  assert.doesNotMatch(replies.semiGym, /락커/);
  for (const text of ["PT 환불 가능한가요?", "양도 비용은요?", "수업 예약 취소하고 싶어요"]) {
    const ticket = receive(null, classify(text, "semi"), 0, "test");
    assert.equal(dueReply(ticket, WAIT), null);
  }
});
