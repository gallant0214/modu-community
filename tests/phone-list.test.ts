import { describe, expect, it } from "vitest";
import { parsePhoneList } from "@/app/lib/phone-list";

describe("parsePhoneList", () => {
  it("명단 원문에서 전화번호만 뽑고 날짜·금액·순번은 버린다", () => {
    const raw = "1\t정초인\t010-3897-9784\t남\t2026-08-05\t3.4\n2,박도현,01094779282,165000";
    expect(parsePhoneList(raw)).toEqual(["01038979784", "01094779282"]);
  });
  it("중복 제거·입력 순서 유지, 쉼표·세미콜론·공백 구분", () => {
    expect(parsePhoneList("010-1111-2222; 010 3333 4444, 01011112222")).toEqual(["01011112222"]);
  });
  it("02 지역번호 9~10자리도 인식", () => {
    expect(parsePhoneList("02-123-4567 02-1234-5678")).toEqual(["021234567", "0212345678"]);
  });
});
