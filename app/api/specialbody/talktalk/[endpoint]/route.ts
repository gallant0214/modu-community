import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getRedis } from "@/app/lib/cache";
import { classify, dueReply, receive, replies, type Ticket } from "@/app/lib/specialbody-talktalk";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ endpoint: string }> };
type Entry = { version: string; ticket: Ticket | null; digest: string; seen: number; epoch: string };
type Settings = { enabled: boolean; minutes: number; epoch: string; observed: number };
const success = () => new Response(null, { status: 200 });
const fail = (status: number) => new Response(null, { status });
const DAY = 86_400;

// https://github.com/navertalk/chatbot-api documents the four webhook source networks.
function fromNaver(request: Request) {
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
  if (process.env.VERCEL !== "1" || isIP(ip) !== 4) return false;
  const bytes = ip.split(".").map(Number);
  return bytes[3] < 32 && ["211.249.40", "211.249.68", "220.230.168", "103.6.173"].includes(bytes.slice(0, 3).join("."));
}
function config() {
  const mode = process.env.TALKTALK_MODE;
  const secret = process.env.TALKTALK_WEBHOOK_SECRET ?? "";
  const cipher = Buffer.from(process.env.TALKTALK_STATE_KEY ?? "", "base64");
  if ((mode !== "test" && mode !== "live") || cipher.length !== 32 || secret.length < 32) return null;
  if (mode === "test" && !process.env.TALKTALK_TEST_USER && (process.env.TALKTALK_TEST_INVITE?.length ?? 0) < 24) return null;
  const base = "sb:talk:" + mode + ":";
  return { mode, secret, cipher, base, queue: base + "due" };
}
function encrypt(user: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(user, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
function decrypt(value: string, key: Buffer) {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
type Redis = NonNullable<ReturnType<typeof getRedis>>;
type Config = NonNullable<ReturnType<typeof config>>;
// One compare-and-swap updates both the ticket and its due index. A losing worker never sends.
const swapScript = `
local old = redis.call('GET', KEYS[1])
if (old and cjson.decode(old).version or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[5])
if ARGV[3] == '' then redis.call('ZREM', KEYS[2], ARGV[4])
else redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4]) end
return 1`;
async function swap(redis: Redis, c: Config, id: string, old: Entry | null, entry: Entry) {
  const ticket = entry.ticket;
  const deadline = ticket?.status === "waiting" ? String(ticket.due) : "";
  return Number(await redis.eval(swapScript, [c.base + id, c.queue], [
    old?.version ?? "", JSON.stringify(entry), deadline, id, 2 * DAY,
  ])) === 1;
}

export async function POST(request: Request, context: Context) {
  if ((await context.params).endpoint === "dispatch") return sheetTick(request);
  const c = config();
  if (!c || !fromNaver(request)) return fail(404);
  const path = Buffer.from((await context.params).endpoint);
  const secret = Buffer.from(c.secret);
  if (path.length !== secret.length || !timingSafeEqual(path, secret)) return fail(404);
  const raw = await request.text();
  if (raw.length > 100_000) return fail(413);
  let event;
  try { event = JSON.parse(raw); } catch { return fail(400); }
  if (!event || typeof event !== "object") return fail(400);
  const { user } = event;
  if (typeof user !== "string" || !user || user.length > 256) return success();
  const incoming = event.event === "send";
  const echo = event.event === "echo" && event.echoedEvent === "send";
  if (!incoming && !echo) return success();
  const text = typeof event.textContent?.text === "string" ? event.textContent.text.trim() : "";
  if (echo && text && text === process.env.TALKTALK_WELCOME_TEXT?.trim()) return success();
  const redis = getRedis();
  if (!redis) return fail(503);
  const mac = (value: string) => createHmac("sha256", c.cipher).update(value).digest("hex");
  const id = mac("user/" + user);
  if (c.mode === "test") {
    const tester = process.env.TALKTALK_TEST_USER;
    if (tester && user !== tester) return success();
    if (!tester) {
      const invite = process.env.TALKTALK_TEST_INVITE;
      if (incoming && invite && text === invite) {
        await redis.set(c.base + "tester", id, { nx: true, ex: DAY });
        return success();
      }
      if (await redis.get<string>(c.base + "tester") !== id) return success();
    }
  }
  const digest = mac("event/" + raw);
  const now = Date.now();
  const settings = await redis.get<Settings>(c.base + "settings");
  if (incoming && (!settings?.enabled || now - settings.observed > 120_000)) return success();
  for (let attempt = 0; attempt < 5; attempt++) {
    const old = await redis.get<Entry>(c.base + id);
    if (old?.digest === digest && now - old.seen < 120_000) return success();
    if (echo && old?.ticket?.status === "closed" && old.ticket.topic in replies &&
        text === replies[old.ticket.topic as keyof typeof replies]) return success();
    // Cashier and partner-center replies cancel a waiting ticket; the next new inquiry can start again.
    const epoch = settings?.epoch ?? "";
    const previous = old?.epoch === epoch ? old.ticket : null;
    const ticket = incoming && settings ? receive(previous, classify(text), now,
      previous?.recipient ?? encrypt(user, c.cipher), settings.minutes * 60_000) : null;
    // Keep the inbound fingerprint after staff replies so a webhook redelivery cannot reopen the ticket.
    const updated = { version: randomUUID(), ticket, epoch, digest: incoming ? digest : old?.digest ?? "", seen: incoming ? now : old?.seen ?? 0 };
    if (await swap(redis, c, id, old, updated)) return success();
  }
  return fail(503);
}

async function sheetTick(request: Request) {
  const key = process.env.TALKTALK_CONTROL_TOKEN;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + key);
  if (!key || key.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return fail(403);
  const c = config();
  if (!c) return fail(503);
  const redis = getRedis();
  const token = process.env.TALKTALK_SEND_TOKEN;
  if (!redis || !token) return fail(503);
  const s: Settings | null = await request.json().catch(() => null);
  if (!s || typeof s.enabled !== "boolean" || !Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 1440 ||
      typeof s.epoch !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(s.epoch) ||
      !Number.isSafeInteger(s.observed) || Math.abs(Date.now() - s.observed) > 90_000) return fail(400);
  const settingsKey = c.base + "settings";
  const accepted = await redis.eval(`
local prev = redis.call('GET',KEYS[1])
if prev and cjson.decode(prev).observed >= tonumber(ARGV[1]) then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'EX',150)
return 1`, [settingsKey], [s.observed, JSON.stringify(s)]);
  if (!Number(accepted) || !s.enabled) return Response.json({ mode: c.mode, enabled: s.enabled });
  const ids = await redis.zrange<string[]>(c.queue, "-inf", Date.now(), { byScore: true, offset: 0, count: 50 });
  let uncertain = 0;
  for (const id of ids) {
    const old = await redis.get<Entry>(c.base + id);
    if (!old) {
      await redis.eval("if redis.call('EXISTS',KEYS[1])==0 then return redis.call('ZREM',KEYS[2],ARGV[1]) end return 0", [c.base + id, c.queue], [id]);
      continue;
    }
    const ticket = old.ticket;
    if (!ticket || ticket.status !== "waiting" || Date.now() < ticket.due) continue;
    const answer = old.epoch === s.epoch ? dueReply(ticket, Date.now()) : null;
    const closed: Entry = { ...old, version: randomUUID(), ticket: { status: "closed", topic: ticket.topic, due: ticket.due } };
    if (!await swap(redis, c, id, old, closed) || !answer || !ticket.recipient) continue;
    const user = decrypt(ticket.recipient, c.cipher);
    if (c.mode === "test") {
      const tester = process.env.TALKTALK_TEST_USER;
      if (tester ? user !== tester : await redis.get<string>(c.base + "tester") !== id) continue;
    }
    if ((await redis.get<Entry>(c.base + id))?.version !== closed.version) continue;
    const latest = await redis.get<Settings>(settingsKey);
    if (!latest?.enabled || latest.epoch !== old.epoch || Date.now() - latest.observed > 90_000) continue;
    try {
      const response = await fetch("https://gw.talk.naver.com/chatbot/v1/event", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(4500),
        headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: token },
        body: JSON.stringify({ event: "send", user, textContent: { text: answer } }),
      });
      if (!response.ok || (await response.json()).success !== true) uncertain++;
    } catch { uncertain++; } // Do not retry an uncertain delivery and risk a second customer message.
  }
  return Response.json({ mode: c.mode, enabled: true, checked: ids.length, uncertain }, { status: uncertain ? 502 : 200 });
}
