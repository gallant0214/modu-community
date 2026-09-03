import { NextResponse } from "next/server";
import crypto from "crypto";
import WebSocket from "ws";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/tts?text=...
 * 텍스트를 한국어 여성 음성(MP3)으로 합성해 반환.
 *
 * 왜: 터치출석 기기(구형 안드로이드 태블릿 등)에 브라우저 TTS(SpeechSynthesis)가 없어
 * 센터에서 설정한 음성 안내가 안 나오는 문제 → 서버에서 오디오로 만들어 어떤 기기든 재생.
 *
 * 엔진 우선순위(무료·키 불필요):
 *  1) Microsoft Edge 신경망 TTS — 여성 SunHi. SSML 로 속도 +25% 반영(음정 왜곡 없음).
 *     → 응답 헤더 X-Tts-Speed: baked (오디오에 속도 이미 반영, 클라 재생속도 1.0)
 *  2) (Edge 실패 시) Google 번역 TTS — 속도 미지원 → 클라에서 재생속도 1.25 적용.
 *     → 응답 헤더 X-Tts-Speed: client
 */

// ── Edge TTS ──
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const SEC_MS_GEC_VERSION = "1-130.0.2849.68";
const WIN_EPOCH = 11644473600;
const EDGE_VOICE = "ko-KR-SunHiNeural"; // 한국어 여성
const EDGE_RATE = "+25%"; // 속도 1.25배

function generateSecMsGec(): string {
  let ticks = Date.now() / 1000 + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100;
  return crypto.createHash("sha256").update(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`, "ascii").digest("hex").toUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function synthesizeEdge(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connectId = crypto.randomUUID().replace(/-/g, "");
    const url =
      `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId}`;
    const ws = new WebSocket(url, {
      headers: {
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Origin": "chrome-extension://jdiccldimpahbhcpdeeaajojlhmnhlhi",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      },
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { try { ws.terminate(); } catch { /* noop */ } reject(new Error("edge timeout")); }, 8000);
    const done = (err: Error | null) => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* noop */ }
      if (err) reject(err);
      else if (chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error("edge no audio"));
    };
    ws.on("open", () => {
      ws.send(
        `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ko-KR'>` +
        `<voice name='${EDGE_VOICE}'><prosody rate='${EDGE_RATE}'>${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${connectId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        const header = data.subarray(2, 2 + headerLen).toString("utf-8");
        if (header.includes("Path:audio")) chunks.push(data.subarray(2 + headerLen));
      } else if (data.toString("utf-8").includes("Path:turn.end")) done(null);
    });
    ws.on("error", (e: Error) => done(e));
    ws.on("close", () => done(null));
  });
}

// ── Google 번역 TTS (폴백) ──
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_CHUNK = 180;
function splitText(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_CHUNK) {
    let cut = rest.lastIndexOf(" ", MAX_CHUNK);
    const punc = Math.max(rest.lastIndexOf(".", MAX_CHUNK), rest.lastIndexOf(",", MAX_CHUNK), rest.lastIndexOf("!", MAX_CHUNK), rest.lastIndexOf("?", MAX_CHUNK));
    if (punc > MAX_CHUNK * 0.5) cut = punc + 1;
    if (cut <= 0) cut = MAX_CHUNK;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
async function synthesizeGoogle(text: string): Promise<Buffer> {
  const chunks = splitText(text);
  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ko` +
      `&total=${chunks.length}&idx=${i}&textlen=${chunks[i].length}&q=${encodeURIComponent(chunks[i])}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://translate.google.com/" }, cache: "no-store" });
    if (!res.ok) throw new Error(`google ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  const out = Buffer.concat(buffers);
  if (!out.length) throw new Error("google no audio");
  return out;
}

// 인스턴스 내 캐시
const cache = new Map<string, { buf: Buffer; speed: string }>();
const CACHE_MAX = 200;

export async function GET(request: Request) {
  const text = (new URL(request.url).searchParams.get("text") || "").trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "text 필요" }, { status: 400 });

  const cached = cache.get(text);
  let audio: Buffer;
  let speed: string; // baked(Edge, 속도내장) | client(Google, 클라 1.25배)
  if (cached) {
    audio = cached.buf;
    speed = cached.speed;
  } else {
    try {
      audio = await synthesizeEdge(text);
      speed = "baked";
    } catch {
      try {
        audio = await synthesizeGoogle(text);
        speed = "client";
      } catch (e) {
        return NextResponse.json({ error: "음성 생성 실패", detail: e instanceof Error ? e.message : "error" }, { status: 502 });
      }
    }
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(text, { buf: audio, speed });
  }

  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "X-Tts-Speed": speed,
      "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
    },
  });
}
