/**
 * 온라인(PG) 결제 상세 — 주문(crm_orders)에 남은 PG 응답에서 **필요한 항목만** 꺼낸다.
 * 외부 연동 API(/api/open/v1/sales)용 (2026-11-15 사용자 요청: 토스·이니시스 정보 + 결제자).
 *
 * 🚨 pg_raw 통째로 내보내지 말 것 — 토스 응답에는 결제별 secret 이 들어 있다.
 *    서버에서도 pg_raw 전체를 읽지 않고 아래 PgOrderFields 의 경로만 select 한다.
 */

/** 화면 표기 — 회원 상세 결제내역의 PG_LABEL 과 같다 */
export const PG_PROVIDER_LABEL: Record<string, string> = { toss: "토스", portone: "KG이니시스", onnuri: "모바일 온누리" };

/** 토스페이먼츠 카드사 코드 (card.issuerCode) */
const TOSS_CARD_ISSUER: Record<string, string> = {
  "3K": "기업비씨",
  "46": "광주은행",
  "71": "롯데카드",
  "30": "KDB산업은행",
  "31": "BC카드",
  "51": "삼성카드",
  "38": "새마을금고",
  "41": "신한카드",
  "62": "신협",
  "36": "씨티카드",
  "33": "우리BC카드",
  W1: "우리카드",
  "37": "우체국예금보험",
  "39": "저축은행중앙회",
  "35": "전북은행",
  "42": "제주은행",
  "15": "카카오뱅크",
  "3A": "케이뱅크",
  "24": "토스뱅크",
  "21": "하나카드",
  "61": "현대카드",
  "11": "KB국민카드",
  "91": "NH농협카드",
  "34": "Sh수협은행",
  "6D": "다이너스",
  "4M": "마스터카드",
  "3C": "유니온페이",
  "7A": "아메리칸익스프레스",
  "4J": "JCB",
  "4V": "VISA",
};

/** 포트원(이니시스) emb_pg_provider — 카드 결제창 안의 간편결제 */
const PORTONE_EASY_PAY: Record<string, string> = {
  kakaopay: "카카오페이",
  naverpay: "네이버페이",
  payco: "페이코",
  samsungpay: "삼성페이",
  tosspay: "토스페이",
  ssgpay: "SSG페이",
  lpay: "L.PAY",
  kpay: "K-PAY",
  kbapp: "KB Pay",
  applepay: "애플페이",
};

/** crm_orders 에서 select 하는 열 (pg_raw 는 경로별로만) */
export const PG_ORDER_SELECT =
  "id, member_id, channel, order_uid, pg_provider, pg_method, pg_approved_at, pg_receipt_url, pg_payment_key, " +
  "toss_card:pg_raw->card, toss_easy_pay:pg_raw->easyPay, " +
  "ini_pg:pg_raw->>pg_provider, ini_card_name:pg_raw->>card_name, ini_apply_num:pg_raw->>apply_num, " +
  "ini_card_quota:pg_raw->>card_quota, ini_buyer_name:pg_raw->>buyer_name, ini_emb_pg:pg_raw->>emb_pg_provider, " +
  "ini_imp_uid:pg_raw->>imp_uid";

export type PgOrderFields = {
  id: number;
  member_id: number | null;
  channel: string | null; // app / web
  order_uid: string | null;
  pg_provider: string | null; // toss / portone
  pg_method: string | null;
  pg_approved_at: string | null;
  pg_receipt_url: string | null;
  pg_payment_key: string | null;
  toss_card: {
    issuerCode?: string | null;
    approveNo?: string | null;
    installmentPlanMonths?: number | null;
    cardType?: string | null;
  } | null;
  toss_easy_pay: { provider?: string | null } | null;
  ini_pg: string | null;
  ini_card_name: string | null;
  ini_apply_num: string | null;
  ini_card_quota: string | null;
  ini_buyer_name: string | null;
  ini_emb_pg: string | null;
  ini_imp_uid: string | null;
};

export type PgDetail = {
  /** 판매 경로: 회원앱 / 홈페이지 */
  channel: string;
  /** PG사: 토스 / KG이니시스 */
  pg: string | null;
  /** PG 결제수단: 카드 / 간편결제 … */
  pg_method: string | null;
  /** 카드사 (간편결제는 비어 있을 수 있음) */
  card_company: string | null;
  /** 간편결제사: 카카오페이·네이버페이·KB Pay … */
  easy_pay: string | null;
  /** 카드 체크/신용 (토스만) */
  card_type: string | null;
  approval_no: string | null;
  installment_months: number | null;
  approved_at: string | null;
  /** 주문번호 (토스 orderId · 포트원 merchant_uid) */
  order_no: string | null;
  /** PG 거래번호 (토스 paymentKey · 포트원 imp_uid) */
  pg_tx_id: string | null;
  receipt_url: string | null;
  /** PG 결제창에 입력된 구매자 이름 (이니시스만 넘겨준다) */
  pg_buyer_name: string | null;
};

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

export function pgDetailFromOrder(o: PgOrderFields): PgDetail {
  const channel = o.channel === "web" ? "홈페이지" : "회원앱";
  const provider = o.pg_provider ?? "";
  if (provider === "toss") {
    const card = o.toss_card ?? null;
    const code = clean(card?.issuerCode);
    return {
      channel,
      pg: PG_PROVIDER_LABEL.toss,
      pg_method: clean(o.pg_method),
      card_company: code ? TOSS_CARD_ISSUER[code] ?? `카드사 코드 ${code}` : null,
      easy_pay: clean(o.toss_easy_pay?.provider),
      card_type: clean(card?.cardType),
      approval_no: clean(card?.approveNo),
      installment_months: typeof card?.installmentPlanMonths === "number" ? card.installmentPlanMonths : null,
      approved_at: o.pg_approved_at,
      order_no: clean(o.order_uid),
      pg_tx_id: clean(o.pg_payment_key),
      receipt_url: clean(o.pg_receipt_url),
      pg_buyer_name: null,
    };
  }
  if (provider === "portone") {
    // pg_method 에는 승인 시 카드사 이름이 저장된다(예: '삼성카드')
    const cardName = clean(o.ini_card_name) ?? clean(o.pg_method);
    const emb = clean(o.ini_emb_pg);
    const quota = Number(o.ini_card_quota);
    return {
      channel,
      pg: o.ini_pg && !/inicis/i.test(o.ini_pg) ? `포트원(${o.ini_pg})` : PG_PROVIDER_LABEL.portone,
      pg_method: emb ? "간편결제" : "카드",
      card_company: cardName,
      easy_pay: emb ? PORTONE_EASY_PAY[emb] ?? emb : null,
      card_type: null,
      approval_no: clean(o.ini_apply_num),
      installment_months: Number.isFinite(quota) && o.ini_card_quota !== null ? quota : null,
      approved_at: o.pg_approved_at,
      order_no: clean(o.order_uid),
      pg_tx_id: clean(o.ini_imp_uid) ?? clean(o.pg_payment_key),
      receipt_url: clean(o.pg_receipt_url),
      pg_buyer_name: clean(o.ini_buyer_name),
    };
  }
  return {
    channel,
    pg: clean(provider),
    pg_method: clean(o.pg_method),
    card_company: null,
    easy_pay: null,
    card_type: null,
    approval_no: null,
    installment_months: null,
    approved_at: o.pg_approved_at,
    order_no: clean(o.order_uid),
    pg_tx_id: clean(o.pg_payment_key),
    receipt_url: clean(o.pg_receipt_url),
    pg_buyer_name: null,
  };
}
