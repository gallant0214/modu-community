import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/tts?text=...&voice=female|male
 * 텍스트를 한국어 음성(MP3)으로 합성해 반환.
 *
 * 왜: 터치출석 기기(구형 안드로이드 태블릿 등)에 브라우저 TTS(SpeechSynthesis)가 없어
 * 센터 설정 음성 안내가 안 나오는 문제 → 서버에서 오디오로 만들어 어떤 기기든 재생.
 *
 * 엔진 우선순위:
 *  1) Google Cloud TTS (진짜 남/여 신경망 음성). Firebase 서비스계정 재활용(별도 키 불필요).
 *     프로젝트에 Text-to-Speech API 활성화 필요. 여성=Neural2-A / 남성=Neural2-C.
 *  2) (실패 시) Google 번역 TTS — 단일 음성(성별 선택 없음). 폴백.
 * 속도는 클라이언트 재생속도(설정 슬라이더)에서 조절.
 */

const GC_VOICE: Record<string, string> = {
  female: "ko-KR-Neural2-A",
  male: "ko-KR-Neural2-C",
};

// ── 서비스 계정으로 GCP 액세스 토큰 발급(캐시) ──
let _token: { value: string; exp: number } | null = null;
async function getGcpToken(): Promise<string | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const now = Math.floor(Date.now() / 1000);
  if (_token && _token.exp > now + 60) return _token.value;
  try {
    let s = raw.trim();
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
    const sa = JSON.parse(s) as { client_email: string; private_key: string };
    const b64u = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
    const claim = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const input = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u(claim)}`;
    const sig = crypto.createSign("RSA-SHA256").update(input).sign(sa.private_key.replace(/\\n/g, "\n"), "base64url");
    const jwt = `${input}.${sig}`;
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const tj = (await tr.json()) as { access_token?: string; expires_in?: number };
    if (!tj.access_token) return null;
    _token = { value: tj.access_token, exp: now + (tj.expires_in ?? 3600) };
    return tj.access_token;
  } catch {
    return null;
  }
}

async function synthesizeGCloud(text: string, voiceKey: string): Promise<Buffer | null> {
  const token = await getGcpToken();
  if (!token) return null;
  try {
    const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ko-KR", name: GC_VOICE[voiceKey] ?? GC_VOICE.female },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { audioContent?: string };
    return j.audioContent ? Buffer.from(j.audioContent, "base64") : null;
  } catch {
    return null;
  }
}

// ── Google 번역 TTS (폴백, 단일 음성) ──
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
async function synthesizeGoogle(text: string): Promise<Buffer | null> {
  try {
    const chunks = splitText(text);
    const buffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const url =
        `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ko` +
        `&total=${chunks.length}&idx=${i}&textlen=${chunks[i].length}&q=${encodeURIComponent(chunks[i])}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://translate.google.com/" }, cache: "no-store" });
      if (!res.ok) return null;
      buffers.push(Buffer.from(await res.arrayBuffer()));
    }
    const out = Buffer.concat(buffers);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

// 인스턴스 내 캐시
const cache = new Map<string, Buffer>();
const CACHE_MAX = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "").trim().slice(0, 600);
  const voiceKey = url.searchParams.get("voice") === "male" ? "male" : "female";
  if (!text) return NextResponse.json({ error: "text 필요" }, { status: 400 });

  const key = `${voiceKey}:${text}`;
  let audio = cache.get(key);
  let engine = "cache";
  if (!audio) {
    audio = (await synthesizeGCloud(text, voiceKey)) ?? undefined;
    engine = "gcloud";
    if (!audio) {
      // Cloud TTS 미활성/실패 → 번역 TTS 폴백(성별 선택 없음)
      audio = (await synthesizeGoogle(text)) ?? undefined;
      engine = "google";
    }
    if (!audio) {
      return NextResponse.json({ error: "음성 생성 실패" }, { status: 502 });
    }
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, audio);
  }

  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "X-Tts-Engine": engine,
      "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
    },
  });
}
