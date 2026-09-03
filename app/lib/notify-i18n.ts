import "server-only";

/**
 * 회원 앱 푸시/알림함 다국어. 회원의 app_language(ko/en/ja/zh)에 맞춰 title/body 렌더.
 * 상품명·회원명·센터가 입력한 사유 등 자유 텍스트(데이터)는 파라미터로 그대로 삽입한다.
 */
export type NotifLang = "ko" | "en" | "ja" | "zh";
const LANGS: NotifLang[] = ["ko", "en", "ja", "zh"];
export function normalizeLang(v: string | null | undefined): NotifLang {
  return (LANGS as string[]).includes(v ?? "") ? (v as NotifLang) : "ko";
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW: Record<NotifLang, string[]> = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

/** ISO → 언어별 슬롯 문자열 (KST) */
export function formatSlot(iso: string, lang: NotifLang): string {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const mo = k.getUTCMonth() + 1;
  const day = k.getUTCDate();
  const dow = DOW[lang][k.getUTCDay()];
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  if (lang === "en") return `${MONTH_EN[k.getUTCMonth()]} ${day} (${dow}) ${hh}:${mm}`;
  if (lang === "ja") return `${mo}月${day}日 (${dow}) ${hh}:${mm}`;
  if (lang === "zh") return `${mo}月${day}日 (${dow}) ${hh}:${mm}`;
  return `${mo}월 ${day}일 (${dow}) ${hh}:${mm}`;
}

type Tpl = Record<NotifLang, string>;
interface NotifTpl { title: Tpl; body: Tpl }

const NOTIF: Record<string, NotifTpl> = {
  reservationCreated: {
    title: { ko: "수업이 예약됐어요 ✅", en: "Class booked ✅", ja: "レッスンが予約されました ✅", zh: "已为您预约课程 ✅" },
    body: {
      ko: "{slot} 수업이 예약됐어요",
      en: "Your {slot} class has been booked",
      ja: "{slot} のレッスンが予約されました",
      zh: "已为您预约 {slot} 的课程",
    },
  },
  reservationConfirmed: {
    title: { ko: "예약이 확정됐어요 ✅", en: "Reservation confirmed ✅", ja: "予約が確定しました ✅", zh: "预约已确认 ✅" },
    body: {
      ko: "{slot} 수업 예약이 확정됐어요",
      en: "Your {slot} class is confirmed",
      ja: "{slot} のレッスン予約が確定しました",
      zh: "{slot} 的课程预约已确认",
    },
  },
  reservationCancelled: {
    title: { ko: "예약이 취소됐어요", en: "Reservation cancelled", ja: "予約が取り消されました", zh: "预约已取消" },
    body: {
      ko: "{slot} 수업 예약이 취소됐어요",
      en: "Your {slot} class was cancelled",
      ja: "{slot} のレッスン予約が取り消されました",
      zh: "{slot} 的课程预约已取消",
    },
  },
  reservationCancelledReason: {
    title: { ko: "예약이 취소됐어요", en: "Reservation cancelled", ja: "予約が取り消されました", zh: "预约已取消" },
    body: {
      ko: "{slot} 수업 예약이 취소됐어요 · 사유: {reason}",
      en: "Your {slot} class was cancelled · Reason: {reason}",
      ja: "{slot} のレッスン予約が取り消されました・理由: {reason}",
      zh: "{slot} 的课程预约已取消 · 原因：{reason}",
    },
  },
  classCancelled: {
    title: { ko: "클래스 수업 예약이 취소되었습니다", en: "Class booking cancelled", ja: "クラス予約が取り消されました", zh: "团课预约已取消" },
    body: {
      ko: "{slot} 클래스 수업 예약이 취소되었습니다",
      en: "Your {slot} class booking was cancelled",
      ja: "{slot} のクラス予約が取り消されました",
      zh: "{slot} 的团课预约已取消",
    },
  },
  reservationRejected: {
    title: { ko: "예약요청이 반려됐어요", en: "Request declined", ja: "予約リクエストが却下されました", zh: "预约请求被拒绝" },
    body: {
      ko: "{slot} 수업 예약이 어려워요. 다른 시간을 선택해주세요.",
      en: "Your {slot} request couldn't be accepted. Please pick another time.",
      ja: "{slot} のレッスン予約は難しいです。別の時間をお選びください。",
      zh: "{slot} 的课程暂时无法预约，请选择其他时间。",
    },
  },
  reservationRejectedReason: {
    title: { ko: "예약요청이 반려됐어요", en: "Request declined", ja: "予約リクエストが却下されました", zh: "预约请求被拒绝" },
    body: {
      ko: "{slot} 수업 예약이 어려워요. 사유: {reason}",
      en: "Your {slot} request couldn't be accepted. Reason: {reason}",
      ja: "{slot} のレッスン予約は難しいです。理由: {reason}",
      zh: "{slot} 的课程暂时无法预约。原因：{reason}",
    },
  },
  reschedule: {
    title: { ko: "수업 시간이 변경됐어요", en: "Class time changed", ja: "レッスン時間が変更されました", zh: "上课时间已变更" },
    body: {
      ko: "{slot}로 수업 시간이 변경됐어요",
      en: "Your class time changed to {slot}",
      ja: "レッスン時間が {slot} に変更されました",
      zh: "上课时间已变更为 {slot}",
    },
  },
  classDone: {
    title: { ko: "수업 완료 처리됐어요 ✅", en: "Class completed ✅", ja: "レッスン完了処理されました ✅", zh: "课程已完成 ✅" },
    body: {
      ko: "{slot} 수업이 출석(완료) 처리됐어요",
      en: "Your {slot} class was marked attended (completed)",
      ja: "{slot} のレッスンが出席(完了)処理されました",
      zh: "{slot} 的课程已标记为出席（完成）",
    },
  },
  noshow: {
    title: { ko: "노쇼 처리됐어요", en: "Marked as no-show", ja: "ノーショー処理されました", zh: "已标记为未到" },
    body: {
      ko: "{slot} 수업이 노쇼(미출석)로 처리됐어요",
      en: "Your {slot} class was marked as a no-show",
      ja: "{slot} のレッスンがノーショー(未出席)処理されました",
      zh: "{slot} 的课程已标记为未到",
    },
  },
  passLast: {
    title: { ko: "수업 1회 남았어요", en: "1 session left", ja: "残り1回です", zh: "还剩1次课" },
    body: {
      ko: "다음 수업이 1회 남았습니다.",
      en: "You have 1 session left.",
      ja: "次のレッスンが残り1回です。",
      zh: "您还剩1次课。",
    },
  },
  passCompleted: {
    title: { ko: "수업 완료 처리됐어요 ✅", en: "All sessions completed ✅", ja: "全レッスン完了 ✅", zh: "课程已全部完成 ✅" },
    body: {
      ko: "수강권의 수업을 모두 완료했어요 🎉",
      en: "You've completed all sessions on your pass 🎉",
      ja: "受講券のレッスンをすべて完了しました 🎉",
      zh: "您已完成课程券的全部课程 🎉",
    },
  },
  mileageEarn: {
    title: { ko: "포인트 적립", en: "Points earned", ja: "ポイント積立", zh: "积分到账" },
    body: {
      ko: "퇴실할 때 {earn}P가 적립되었습니다. 현재 적립된 포인트는 {bal}P 입니다.",
      en: "You earned {earn}P at checkout. Your balance is {bal}P.",
      ja: "退室時に {earn}P が積み立てられました。現在のポイントは {bal}P です。",
      zh: "离场时获得 {earn}P 积分。当前积分为 {bal}P。",
    },
  },
  membershipExpiring: {
    title: { ko: "회원권 만료 임박", en: "Membership expiring soon", ja: "会員券まもなく期限切れ", zh: "会员券即将到期" },
    body: {
      ko: "{name}님의 {plan} 회원권이 7일 후 만료돼요.",
      en: "{name}'s {plan} membership expires in 7 days.",
      ja: "{name}さんの {plan} 会員券は7日後に期限切れです。",
      zh: "{name} 的 {plan} 会员券将在7天后到期。",
    },
  },
  membershipExpired: {
    title: { ko: "회원권 종료 안내", en: "Membership ended", ja: "会員券終了のお知らせ", zh: "会员券到期提醒" },
    body: {
      ko: "{name}님, 오늘이 {plan} 회원권 종료일이에요. 그동안 함께해 주셔서 감사합니다 🙏",
      en: "{name}, your {plan} membership ends today. Thank you for being with us 🙏",
      ja: "{name}さん、本日が {plan} 会員券の終了日です。ご利用ありがとうございました 🙏",
      zh: "{name}，今天是您 {plan} 会员券的到期日。感谢您一直以来的支持 🙏",
    },
  },
  reservationReminder: {
    title: { ko: "내일 수업 예약 안내", en: "Class reminder for tomorrow", ja: "明日のレッスンのご案内", zh: "明日课程提醒" },
    body: {
      ko: "{name}님, 내일 {time} 수업이 있어요.",
      en: "{name}, you have a class tomorrow at {time}.",
      ja: "{name}さん、明日 {time} にレッスンがあります。",
      zh: "{name}，您明天 {time} 有一节课。",
    },
  },
  passExpiring: {
    title: { ko: "수강권 유효기간 안내", en: "Pass expiring soon", ja: "受講券の有効期限のお知らせ", zh: "课程券有效期提醒" },
    body: {
      ko: "{lesson}의 수강권이 유효기간 {days}일 남았습니다",
      en: "Your {lesson} pass expires in {days} days",
      ja: "{lesson} の受講券は有効期限まで残り {days} 日です",
      zh: "您的 {lesson} 课程券有效期还剩 {days} 天",
    },
  },
};

function fill(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** 알림 키 + 언어 + 파라미터 → { title, body } */
export function renderNotif(
  key: string,
  lang: NotifLang,
  params?: Record<string, string | number>
): { title: string; body: string } {
  const tpl = NOTIF[key];
  if (!tpl) return { title: key, body: "" };
  return {
    title: fill(tpl.title[lang] ?? tpl.title.ko, params),
    body: fill(tpl.body[lang] ?? tpl.body.ko, params),
  };
}
