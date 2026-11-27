export const WAIT = 20 * 60_000;
export const GRACE = 5 * 60_000;
const visitGuide = `방문 상담은 사전 예약제로 운영하고 있습니다.
아래에서 원하시는 날짜와 시간을 선택한 후 예약해 주시기 바랍니다.`;
const gymConsultation = { title: "헬스 상담 예약", url: "https://booking.naver.com/booking/13/bizes/445175/items/3697432" };
const ptConsultation = { title: "PT 상담 예약", url: "https://booking.naver.com/booking/13/bizes/445175/items/3697107" };
export const replies = {
  visit: visitGuide,
  gymVisit: visitGuide,
  ptVisit: visitGuide,
  semi: `기본형 세미 PT는 회당 30분 수업입니다.

10회 440,000원
20회 880,000원
30회 1,210,000원

모두 부가세 포함 금액입니다. 헬스 이용권과 개인 락커는 별도입니다.`,
  day: `일일권은 현장 결제 15,000원, 네이버예약 일반 결제 13,500원입니다.

재방문 시 직전 일일권 이용 리뷰를 작성하셨다면 네이버예약에서 7,900원 상품을 선택하실 수 있습니다. 재방문 후에도 리뷰를 남기시면 다음 방문에 같은 가격이 적용됩니다. 리뷰가 없으면 네이버예약 일반가인 13,500원입니다.

주말에도 운동복과 수건이 포함됩니다. 샤워실에는 샴푸, 린스, 바디워시, 바디로션, 폼클렌징이 준비되어 있습니다.

매월 마지막 주 일요일은 정기휴무입니다.`,
  pt: `신규 일반 1:1 PT는 회당 50분 수업입니다.

10회 660,000원 (이용 기간 40일)
20회 1,298,000원 (이용 기간 80일)

모두 부가세 포함 금액입니다. 해당 기간에는 헬스 이용권과 개인 락커가 포함됩니다.

${visitGuide}`,
  hours: `스페셜바디 범어점은 24시간 운영합니다.
매월 마지막 주 일요일은 정기휴무입니다.`,
  parking: `범어역 3번 출구 근처 애플2타워 3층입니다.
건물 주차장은 2시간까지 무료로 이용하실 수 있습니다.`,
  kit: `기간제 회원의 운동복 대여료는 신규·재등록 모두 월 10,000원입니다.

개인 락커는 헬스 신규 1~3개월 등록 시 월 5,000원입니다. 신규 6개월 이상이거나 재등록하시면 등록하신 기간만큼 무료입니다.

일일권에는 주말에도 운동복과 수건이 포함됩니다.`,
  gym: `신규 헬스 회원권 가격을 안내드립니다.

1개월 77,000원
3개월 185,000원
6개월 319,000원

모두 부가세 포함 금액입니다. 재등록이나 다른 기간을 생각하고 계시면 원하시는 기간을 말씀해 주시겠어요?`,
} as const;

export type Topic = keyof typeof replies | "staff" | "greeting";
export function classify(text: string): Topic {
  const s = text.toLowerCase().replace(/\s+/g, "");
  if (/^(?:안녕(?:하세요|하세용)?|문의드립니다|안녕하세요문의드립니다)[.!?~😊]*$/.test(s)) return "greeting";
  if (!s || /환불|정지|홀딩|양도|분실|불만|변경|취소|아프|질환|부상|수술|통증|학생|수험|할인|쿠폰|이벤트|체험|무료피티|무료pt|시니어|예약했|결제했|재등록가격|재등록금액/.test(s)) return "staff";
  const visit = /방문(?:전.*예약|예약|상담|하고싶|을?원|하려|해도|가능|할수|할게|하고자)|(?:헬스|pt|피티)상담|상담(?:을)?(?:예약|받|원|하고싶|가능|신청|가고싶)|예약상담|찾아가|찾아뵙|구경하고싶|둘러보고싶/.test(s)
    || /^(?:예약방법|예약링크|예약하고싶|예약은어떻게|상담링크)/.test(s);
  if (visit && !/가격|금액|얼마|비용|일일|재방문|수업예약|예약내역|예약확인|예약완료|예약했|예약해뒀|예약해놨/.test(s)) {
    if (/운동복|락커|주차|운영시간/.test(s)) return "staff";
    const pt = /pt|피티|퍼스널/.test(s);
    const gym = /헬스|회원권/.test(s);
    return pt === gym ? "visit" : pt ? "ptVisit" : "gymVisit";
  }
  if (/세미(?:pt|피티|퍼스널)/.test(s)) {
    if (/일일권|일반(?:pt|피티)|50분|주차|운영시간|예약|가능시간|유효기간|이용기간|운동복|트레이너/.test(s)) return "staff";
    return /가격|금액|얼마|비용|요금|몇회|\d+회|헬스|회원권|락커|라커|사물함|포함|별도|문의/.test(s) ? "semi" : "staff";
  }
  if (/세미|30분/.test(s)) return "staff";
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
export function receive(ticket: Ticket | null, topic: Topic, now: number, recipient: string, wait = WAIT): Ticket {
  if (!ticket || ticket.status === "closed") return { status: "waiting", topic, due: now + wait, recipient };
  if (topic === "greeting" || topic === ticket.topic) return ticket;
  return { ...ticket, topic: ticket.topic === "greeting" ? topic : "staff" };
}
export function dueReply(ticket: Ticket, now: number) {
  if (ticket.status !== "waiting" || now < ticket.due || now > ticket.due + GRACE ||
      ticket.topic === "staff" || ticket.topic === "greeting") return null;
  return replies[ticket.topic];
}

export function replyContent(topic: Topic, text: string) {
  const products = topic === "visit" ? [gymConsultation, ptConsultation]
    : topic === "gymVisit" ? [gymConsultation]
    : topic === "ptVisit" || topic === "pt" ? [ptConsultation] : [];
  if (!products.length) return { text };
  const buttonList = products.map(({ title, url }) => ({ type: "LINK", data: { title, url, mobileUrl: url } }));
  return { text, quickReply: { buttonList } };
}
