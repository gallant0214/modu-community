import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/tts?text=...
 * 텍스트를 한국어 음성(MP3)으로 합성해 반환.
 *
 * 왜: 터치출석 기기(구형 안드로이드 태블릿 등)에 브라우저 TTS(SpeechSynthesis)가 없어
 * 센터에서 설정한 음성 안내가 안 나오는 문제 → 서버에서 오디오로 만들어 어떤 기기든 재생.
 *
 * 엔진: Google 번역 TTS (무료·키 불필요). 문장을 200자 이하로 분할해 각각 합성 후 이어붙임.
 * 동일 문구는 CDN/브라우저 캐시로 즉시 재생되도록 Cache-Control 설정.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_CHUNK = 180;

/** 200자 제한에 맞춰 공백/문장부호 경계로 분할 */
function splitText(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_CHUNK) {
    let cut = rest.lastIndexOf(" ", MAX_CHUNK);
    const punc = Math.max(
      rest.lastIndexOf(".", MAX_CHUNK),
      rest.lastIndexOf(",", MAX_CHUNK),
      rest.lastIndexOf("!", MAX_CHUNK),
      rest.lastIndexOf("?", MAX_CHUNK),
      rest.lastIndexOf("。", MAX_CHUNK)
    );
    if (punc > MAX_CHUNK * 0.5) cut = punc + 1;
    if (cut <= 0) cut = MAX_CHUNK;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function synthesizeChunk(text: string, idx: number, total: number): Promise<Buffer> {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ko` +
    `&total=${total}&idx=${idx}&textlen=${text.length}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Referer": "https://translate.google.com/" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// 인스턴스 내 캐시 (Fluid Compute 재사용 시 반복 문구 즉시 응답)
const cache = new Map<string, Buffer>();
const CACHE_MAX = 200;

export async function GET(request: Request) {
  const text = (new URL(request.url).searchParams.get("text") || "").trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "text 필요" }, { status: 400 });

  let audio = cache.get(text);
  if (!audio) {
    try {
      const chunks = splitText(text);
      const buffers: Buffer[] = [];
      for (let i = 0; i < chunks.length; i++) {
        buffers.push(await synthesizeChunk(chunks[i], i, chunks.length));
      }
      audio = Buffer.concat(buffers);
      if (!audio.length) throw new Error("no audio");
    } catch (e) {
      return NextResponse.json(
        { error: "음성 생성 실패", detail: e instanceof Error ? e.message : "error" },
        { status: 502 }
      );
    }
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(text, audio);
  }

  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
    },
  });
}
