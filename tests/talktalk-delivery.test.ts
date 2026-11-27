import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/specialbody/talktalk/[endpoint]/route";
import { WAIT, replies } from "@/app/lib/specialbody-talktalk";

const records = new Map<string, string>();
const deadlines = new Map<string, number>();
vi.mock("@/app/lib/cache", () => ({
  getRedis: () => ({
    async get(key: string) { return JSON.parse(records.get(key) ?? "null"); },
    async zrange(_key: string, _min: string, now: number) {
      return [...deadlines.entries()].filter(([, t]) => t <= now).map(([id]) => id);
    },
    async eval(_script: string, [key]: string[], [version, json, due, id]: string[]) {
      if ((JSON.parse(records.get(key) ?? "null")?.version ?? "") !== version) return 0;
      records.set(key, json);
      if (due) deadlines.set(id, Number(due)); else deadlines.delete(id);
      return 1;
    },
  }),
}));
const endpoint = "a-test-only-path-of-at-least-32-characters";
const user = "synthetic-tester";
const send = (text: string, echo = false, to = user, ip = "211.249.40.3") =>
  POST(new Request("https://example.invalid/", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": ip },
    body: JSON.stringify({ user: to, event: echo ? "echo" : "send", echoedEvent: echo ? "send" : undefined, textContent: { text } }),
  }), { params: Promise.resolve({ endpoint }) });
const tick = () => GET(new Request("https://example.invalid/", { headers: { authorization: "Bearer test-cron" } }),
  { params: Promise.resolve({ endpoint: "dispatch" }) });

beforeEach(() => {
  records.clear(); deadlines.clear(); vi.useFakeTimers(); vi.setSystemTime(10_000);
  for (const [k, v] of Object.entries({
    VERCEL: "1", CRON_SECRET: "test-cron", TALKTALK_MODE: "test", TALKTALK_TEST_USER: user,
    TALKTALK_STATE_KEY: Buffer.alloc(32, 7).toString("base64"), TALKTALK_WEBHOOK_SECRET: endpoint,
    TALKTALK_SEND_TOKEN: "test-only", TALKTALK_WELCOME_TEXT: "어서오세요",
  })) vi.stubEnv(k, v);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("waits from the first inquiry, ignores welcome and dispatches once across concurrent workers", async () => {
  await send("일일권 가격"); await send("어서오세요", true);
  vi.setSystemTime(10_000 + WAIT - 1); await send("주말 일일권 가격");
  await tick(); expect(fetch).not.toHaveBeenCalled();
  vi.setSystemTime(10_000 + WAIT); await Promise.all([tick(), tick()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  const message = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(message.user).toBe(user); expect(message.textContent.text).toBe(replies.day);
  await send(replies.day, true); await tick(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("cancels for a staff reply even if the employee uses the same wording as a template", async () => {
  await send("일일권 얼마예요?"); await send(replies.day, true); await send("일일권 얼마예요?");
  vi.setSystemTime(10_000 + WAIT); await tick(); expect(fetch).not.toHaveBeenCalled();
});
it("leaves unconfirmed answers to staff and discards ineligible testers and non-Naver traffic", async () => {
  await send("30분 PT 가격"); await send("일일권", false, "someone-else");
  expect((await send("일일권", false, user, "192.0.2.5")).status).toBe(404);
  vi.setSystemTime(10_000 + WAIT); await tick(); expect(fetch).not.toHaveBeenCalled();
});
it("does not retry an uncertain delivery", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("timed out"));
  await send("일일권"); vi.setSystemTime(10_000 + WAIT);
  expect((await tick()).status).toBe(502); await tick(); expect(fetch).toHaveBeenCalledTimes(1);
});
