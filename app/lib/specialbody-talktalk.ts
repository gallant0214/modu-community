export const WAIT = 20 * 60_000;
export const GRACE = 5 * 60_000;
export const replies = {
  day: "안녕하세요 😊 일일권은 현장 결제 15,000원, 네이버예약 일반 결제 13,500원이에요. 재방문하실 때 직전 일일권 이용 리뷰를 작성하셨다면 네이버예약에서 7,900원 상품을 선택해 결제해 주세요. 이용할 때마다 그 이용분의 리뷰를 남기시면 다음 방문도 같은 조건이에요. 직전 리뷰가 없으면 네이버예약 일반가 13,500원이에요. 주말에도 운동복과 수건이 포함되고 샴푸·린스·바디워시·바디로션·폼클렌징도 준비돼 있어요. 매월 마지막 주 일요일은 정기휴무예요.",
  pt: "안녕하세요 😊 신규 일반 1:1 PT는 회당 50분이에요. 10회는 660,000원에 40일, 20회는 1,298,000원에 80일 동안 헬스 이용권과 개인 락커가 포함돼요. 모두 부가세 포함 금액이에요. 방문 상담을 원하시면 편한 요일과 시간대를 알려주세요.",
  hours: "안녕하세요 😊 스페셜바디 범어점은 24시간 운영하고, 매월 마지막 주 일요일은 정기휴무예요.",
  parking: "안녕하세요 😊 범어역 3번 출구 근처 애플2타워 3층에 있어요. 건물 주차장은 2시간 무료로 이용하실 수 있어요.",
  kit: "안녕하세요 😊 기간제 회원의 운동복 대여는 신규·재등록 모두 월 10,000원이에요. 개인 락커는 헬스 신규 1~3개월 등록 시 월 5,000원이고, 신규 6개월 이상 또는 재등록 시에는 등록 기간 동안 포함돼요. 일일권은 주말에도 운동복과 수건이 포함돼요.",
  gym: "안녕하세요 😊 헬스 신규 회원권은 1개월 77,000원, 3개월 185,000원, 6개월 319,000원이에요. 모두 부가세 포함 금액이에요. 재등록이시거나 다른 기간을 원하시면 알려주세요.",
} as const;

export type Topic = keyof typeof replies | "staff" | "greeting";
export function classify(text: string): Topic {
  const s = text.toLowerCase().replace(/\s+/g, "");
  if (/^(?:안녕(?:하세요|하세용)?|문의드립니다|안녕하세요문의드립니다)[.!?~😊]*$/.test(s)) return "greeting";
  if (!s || /환불|정지|홀딩|양도|분실|불만|변경|취소|아프|질환|부상|수술|통증|학생|수험|할인|쿠폰|이벤트|체험|무료피티|무료pt|시니어|세미|30분|예약했|결제했|재등록가격|재등록금액/.test(s)) return "staff";
  const day = /일일|1일권|하루이용|하루권/.test(s) || /재방문/.test(s) && /리뷰|7,?900원/.test(s);
  const kit = /운동복|수건|락커|라커|사물함|샤워/.test(s);
  const topics: Topic[] = [];
  if (day) topics.push("day");
  if (/(?:pt|피티|퍼스널)/.test(s)) topics.push("pt");
  if (/영업시간|운영시간|24시간|휴무/.test(s)) topics.push("hours");
  if (/주차|오시는길|위치/.test(s)) topics.push("parking");
  if (kit && !day) topics.push("kit");
  if (!day && !/재등록/.test(s) && /헬스|회원권/.test(s) && /가격|금액|얼마|이용료/.test(s) && !topics.length) {
    if (/\d+개월/.test(s) && /(?:2|8|12)개월/.test(s)) return "staff";
    topics.push("gym");
  }
  return topics.length === 1 ? topics[0] : "staff";
}

export type Ticket = { status: "waiting" | "closed"; topic: Topic; due: number; recipient?: string };
export function receive(ticket: Ticket | null, topic: Topic, now: number, recipient: string): Ticket {
  if (!ticket) return { status: "waiting", topic, due: now + WAIT, recipient };
  if (ticket.status === "closed" || topic === "greeting" || topic === ticket.topic) return ticket;
  return { ...ticket, topic: ticket.topic === "greeting" ? topic : "staff" };
}
export function dueReply(ticket: Ticket, now: number) {
  if (ticket.status !== "waiting" || now < ticket.due || now > ticket.due + GRACE ||
      ticket.topic === "staff" || ticket.topic === "greeting") return null;
  return replies[ticket.topic];
}
