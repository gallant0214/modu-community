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
  semi: `기본형 세미 PT 가격을 안내드립니다.

10회 440,000원
20회 880,000원
30회 1,210,000원

모두 부가세 포함 금액입니다.`,
  semiTime: "기본형 세미 PT는 회당 30분 수업입니다.",
  ptTime: "일반 1:1 PT는 회당 50분 수업입니다.",
  ptPeriod: "신규 일반 PT의 이용 기간은 10회 40일, 20회 80일입니다.",
  semiGym: "세미 PT의 헬스 이용권은 별도입니다.",
  semiLocker: "세미 PT의 개인 락커는 별도입니다.",
  semiIncludes: "세미 PT의 헬스 이용권과 개인 락커는 별도입니다.",
  ptGym: "신규 일반 PT 10회·20회에는 해당 기간의 헬스 이용권이 포함됩니다.",
  ptLocker: "신규 일반 PT 10회·20회에는 해당 기간의 개인 락커가 포함됩니다.",
  ptIncludes: "신규 일반 PT 10회·20회에는 해당 기간의 헬스 이용권과 개인 락커가 포함됩니다.",
  day: `일일권은 현장 결제 15,000원, 네이버예약 일반 결제 13,500원입니다.

재방문 시 직전 일일권 이용 리뷰를 작성하셨다면 네이버예약에서 7,900원 상품을 선택하실 수 있습니다. 재방문 후에도 리뷰를 남기시면 다음 방문에 같은 가격이 적용됩니다. 리뷰가 없으면 네이버예약 일반가인 13,500원입니다.

주말에도 운동복과 수건이 포함됩니다. 샤워실에는 샴푸, 린스, 바디워시, 바디로션, 폼클렌징이 준비되어 있습니다.

매월 마지막 주 일요일은 정기휴무입니다.`,
  pt: `신규 일반 1:1 PT 가격을 안내드립니다.

10회 660,000원
20회 1,298,000원

모두 부가세 포함 금액입니다.

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

export type Topic = keyof typeof replies | "staff" | "greeting" | "advertisement";

function isAdvertisement(text: string): boolean {
  const lines = text.normalize("NFKC").toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, "");
  if (/(?:^|\n)\s*(?:[\[(【<]\s*광\s*고\s*[\])】>]|광고\s*[:：])/.test(lines)) return true;
  const compact = lines.replace(/\s+/g, "");
  if (/(?:무료)?수신거부[:：.)-]*080|080[-\d]{7,}.{0,12}수신거부/.test(compact)) return true;
  return /(?:광고|마케팅|홍보)대행(?:사입니다|업체입니다|서비스|을?제안|해드|해드리)|(?:광고|제휴|협찬|협업|입점|협력|납품|홍보)제안(?:서|드|을?드|합니다|드립니다|차)|(?:상위노출|리뷰관리|블로그체험단|회원모객|회원모집대행).{0,18}(?:보장|해드립|도와드립|제안드|모집해드)/.test(compact);
}

function ptProduct(topic?: Topic) {
  if (topic === "pt" || topic === "ptVisit" || topic === "ptTime" || topic === "ptPeriod" || topic === "ptIncludes" || topic === "ptGym" || topic === "ptLocker") return "pt";
  if (topic === "semi" || topic === "semiTime" || topic === "semiIncludes" || topic === "semiGym" || topic === "semiLocker") return "semi";
  return null;
}

export function classify(text: string, previous?: Topic): Topic | "availability" | "reminder" {
  if (isAdvertisement(text)) return "advertisement";
  const s = text.toLowerCase().replace(/\s+/g, "");
  const brief = s.replace(/[.,!?~。？！·]/g, "");
  if (/^(?:답장|답변|회신)(?:을)?(?:부탁드립니다|부탁드려요|부탁해요|주세요|부탁합니다)$/.test(brief)) return "reminder";
  if (/^(?:오늘|내일|모레|이번주|다음주|주말|[월화수목금토일]요일)[은는도에]?(?:오전|오후|저녁)?(?:\d{1,2}시(?:반|\d{1,2}분)?)?[에도]?(?:방문|상담|예약)?이?(?:가능(?:한가요|할까요|할까|해요|하세요|하실까요|한지요)?|되나요|되죠|될까요|돼요)$/.test(brief)) return "availability";
  if (/^(?:안녕(?:하세요|하세용)?|문의드립니다|안녕하세요문의드립니다)[.!?~😊]*$/.test(s)) return "greeting";
  if (!s || /환불|정지|홀딩|양도|해지|위약금|차감|노쇼|소멸|분실|불만|변경|취소|아프|질환|부상|수술|통증|학생|수험|할인|쿠폰|이벤트|체험|무료피티|무료pt|시니어|예약했|결제했|재등록가격|재등록금액/.test(s)) return "staff";
  const visit = /방문(?:전.*예약|예약|상담|하고싶|을?원|하려|해도|가능|할수|할게|하고자)|(?:헬스|pt|피티)상담|상담(?:을)?(?:예약|받|원|하고싶|가능|신청|가고싶)|예약상담|찾아가|찾아뵙|구경하고싶|둘러보고싶/.test(s)
    || /^(?:예약방법|예약링크|예약하고싶|예약은어떻게|상담링크)/.test(s);
  if (visit && !/가격|금액|얼마|비용|일일|재방문|수업예약|예약내역|예약확인|예약완료|예약했|예약해뒀|예약해놨/.test(s)) {
    if (/운동복|락커|주차|운영시간/.test(s)) return "staff";
    const pt = /pt|피티|퍼스널/.test(s);
    const gym = /헬스|회원권/.test(s);
    return pt === gym ? "visit" : pt ? "ptVisit" : "gymVisit";
  }
  const semi = /세미(?:pt|피티|퍼스널)?/.test(s);
  const explicitPt = /pt|피티|퍼스널/.test(s);
  const previousProduct = /헬스(?:만|단독|회원권가격)|일일권/.test(s) ? null : ptProduct(previous);
  const product = semi ? "semi" : explicitPt ? "pt" : previousProduct;
  if (product && /이용기간|유효기간/.test(s)) {
    const counts = s.match(/\d+(?=회)/g) ?? [];
    const standard = counts.every(count => count === "10" || count === "20");
    return product === "pt" && standard && !/세미|30분|가격|금액|헬스|락커|예약|연장/.test(s) ? "ptPeriod" : "staff";
  }
  const duration = /몇분|수업시간[?!.~]*$|수업시간(?:은|이)(?:몇분|얼마나|어떻게)|회당시간|한회.{0,6}얼마나|회당.{0,6}얼마나/.test(s);
  const locker = /락커|라커|로커|사물함/.test(s);
  const gym = /헬스|회원권|개인운동|자유운동/.test(s);
  const inclusion = /포함|별도|딸려|같이쓸|함께쓸|같이이용|함께이용/.test(s) || locker && /(?:는요|은요|도요)[?!.~]*$/.test(s);
  if (product && (duration || inclusion) && !/일일|운동복|수건|샤워|주차|운영시간|예약|트레이너|비교|차이|기간|유효|시간대|시간표/.test(s)) {
    if ((semi && /일반|50분/.test(s)) || (!semi && /30분/.test(s)) || /가격|금액|비용|요금/.test(s) || (duration && inclusion)) return "staff";
    if (duration) return product === "semi" ? "semiTime" : "ptTime";
    if (locker && !gym) return product === "semi" ? "semiLocker" : "ptLocker";
    if (gym && !locker) return product === "semi" ? "semiGym" : "ptGym";
    if ((gym && locker) || /뭐가|무엇이|어떤것|포함사항|포함항목/.test(s)) return product === "semi" ? "semiIncludes" : "ptIncludes";
    return "staff";
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
export function receive(ticket: Ticket | null, inquiry: ReturnType<typeof classify>, now: number, recipient: string, wait = WAIT): Ticket {
  if (inquiry === "advertisement") return { status: "closed", topic: inquiry, due: now };
  if (inquiry === "reminder" && ticket) return ticket;
  let topic: Topic;
  if (inquiry === "availability") {
    const previous = ticket && now <= ticket.due + 24 * 60 * 60_000 ? ticket.topic : null;
    if (ptProduct(previous ?? undefined)) topic = "ptVisit";
    else if (previous === "gym" || previous === "gymVisit") topic = "gymVisit";
    else if (previous === "visit") topic = "visit";
    else topic = "staff";
    if (topic !== "staff" && ticket?.status === "waiting") return { ...ticket, topic };
  } else {
    topic = inquiry === "reminder" ? "staff" : inquiry;
  }
  if (!ticket || ticket.status === "closed") return { status: "waiting", topic, due: now + wait, recipient };
  if (topic === "greeting" || topic === ticket.topic) return ticket;
  return { ...ticket, topic: ticket.topic === "greeting" ? topic : "staff" };
}
export function dueReply(ticket: Ticket, now: number) {
  if (ticket.status !== "waiting" || now < ticket.due || now > ticket.due + GRACE ||
      ticket.topic === "staff" || ticket.topic === "greeting" || ticket.topic === "advertisement") return null;
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
