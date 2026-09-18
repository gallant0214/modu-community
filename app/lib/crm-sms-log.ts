import { supabase } from "@/app/lib/supabase";

/**
 * 문자 발송 이력(crm_sms_logs) 기록.
 * 문자 탭(sms/send)과 메세지 전송 탭(messages) 이 같은 형식으로 남기도록 공용화.
 */
export async function logSmsSend(opts: {
  centerId: number;
  uid: string;
  receivers: string[];
  msg: string;
  msgType: string;
  title?: string;
  testmode: boolean;
  resultCode: number;
  resultMsg: string;
  successCnt: number;
  errorCnt: number;
  groupId?: string | null;
}) {
  const { receivers } = opts;
  await supabase.from("crm_sms_logs").insert({
    center_id: opts.centerId,
    sender: process.env.SOLAPI_SENDER ?? "",
    receivers:
      receivers.slice(0, 50).join(",") + (receivers.length > 50 ? ` 외 ${receivers.length - 50}` : ""),
    receiver_cnt: receivers.length,
    msg: opts.msg,
    msg_type: opts.msgType,
    title: opts.title ?? null,
    testmode: opts.testmode,
    result_code: opts.resultCode,
    result_msg: opts.resultMsg,
    success_cnt: opts.successCnt,
    error_cnt: opts.errorCnt,
    aligo_msg_id: opts.groupId ?? null,
    sent_by_uid: opts.uid,
  } as never);
}
