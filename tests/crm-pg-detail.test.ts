import { describe, expect, it } from "vitest";
import { pgDetailFromOrder, type PgOrderFields } from "@/app/lib/crm-pg-detail";

const base: PgOrderFields = {
  id: 1,
  member_id: 10,
  channel: "app",
  order_uid: "mo_1_10_x",
  pg_provider: null,
  pg_method: null,
  pg_approved_at: "2026-11-15T11:34:07+00:00",
  pg_receipt_url: "https://receipt.example/1",
  pg_payment_key: "pk_1",
  toss_card: null,
  toss_easy_pay: null,
  ini_pg: null,
  ini_card_name: null,
  ini_apply_num: null,
  ini_card_quota: null,
  ini_buyer_name: null,
  ini_emb_pg: null,
  ini_imp_uid: null,
};

describe("pgDetailFromOrder", () => {
  it("토스 간편결제 — 카카오페이, 카드사 없음", () => {
    const d = pgDetailFromOrder({ ...base, pg_provider: "toss", pg_method: "간편결제", toss_easy_pay: { provider: "카카오페이" } });
    expect(d).toMatchObject({ channel: "회원앱", pg: "토스", pg_method: "간편결제", easy_pay: "카카오페이", card_company: null, pg_tx_id: "pk_1", order_no: "mo_1_10_x" });
  });
  it("토스 카드 — 카드사 코드·승인번호·할부", () => {
    const d = pgDetailFromOrder({
      ...base,
      channel: "web",
      pg_provider: "toss",
      pg_method: "카드",
      toss_card: { issuerCode: "41", approveNo: "12345678", installmentPlanMonths: 3, cardType: "신용" },
    });
    expect(d).toMatchObject({ channel: "홈페이지", card_company: "신한카드", approval_no: "12345678", installment_months: 3, card_type: "신용" });
  });
  it("모르는 카드사 코드는 코드 그대로", () => {
    const d = pgDetailFromOrder({ ...base, pg_provider: "toss", toss_card: { issuerCode: "ZZ" } });
    expect(d.card_company).toBe("카드사 코드 ZZ");
  });
  it("KG이니시스 — 카드사·승인번호·구매자·imp_uid", () => {
    const d = pgDetailFromOrder({
      ...base,
      pg_provider: "portone",
      pg_method: "비씨카드",
      ini_pg: "html5_inicis",
      ini_card_name: "비씨카드",
      ini_apply_num: "35651985",
      ini_card_quota: "5",
      ini_buyer_name: "정주현",
      ini_imp_uid: "imp_1",
    });
    expect(d).toMatchObject({ pg: "KG이니시스", pg_method: "카드", card_company: "비씨카드", approval_no: "35651985", installment_months: 5, pg_buyer_name: "정주현", pg_tx_id: "imp_1", easy_pay: null });
  });
  it("KG이니시스 결제창 안 간편결제(KB Pay)", () => {
    const d = pgDetailFromOrder({ ...base, pg_provider: "portone", ini_pg: "html5_inicis", ini_card_name: "국민카드", ini_emb_pg: "kbapp", ini_card_quota: "0" });
    expect(d).toMatchObject({ pg_method: "간편결제", easy_pay: "KB Pay", card_company: "국민카드", installment_months: 0 });
  });
});
