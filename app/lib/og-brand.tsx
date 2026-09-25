import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 카톡·페이스북 등에서 링크 미리보기로 뜨는 OG 이미지 (1200x630).
 * "커뮤니티 앱인 줄 알고 꺼려하는" 문제를 해결하기 위해
 * 회원권 · 수강권 · 공부 · 교육 이 통합된 서비스임을 한 장으로 전달한다.
 *
 * 경로별 opengraph-image.tsx 에서 이 함수만 호출하면 된다.
 */

type Kind = "invite" | "shop";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;
export const OG_ALT = "모두의 지도사 — 회원권·수강권·공부·교육 통합 서비스";

const PILLS = ["회원권", "수강권", "공부", "교육"] as const;

// 로고 파일을 base64 data URL 로 인라인 (외부 URL 의존 제거, ImageResponse 에서 안정)
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const p = join(process.cwd(), "public", "icon-512.png");
    const buf = await readFile(p);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// 카톡·검색봇이 폰트를 볼 수 있게 Google Fonts 에서 한글 서브셋만 받아온다.
// (전체 폰트 다운로드는 무겁고 캐시 부담)
async function loadKoreanFont(text: string, weight: 400 | 700 | 800): Promise<ArrayBuffer | null> {
  try {
    const family = `Noto Sans KR:wght@${weight}`;
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, {
      headers: {
        // GoogleFonts 가 UA 로 폰트 포맷 결정 — TTF 를 유도
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    }).then((r) => (r.ok ? r.text() : ""));
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(truetype|opentype)['"]?\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export async function renderBrandOG(opts: {
  centerName: string;
  kind: Kind;
}): Promise<ImageResponse> {
  const { centerName, kind } = opts;
  const headline = centerName?.trim() || "모두의 지도사";
  const subhead = kind === "invite" ? "회원 초대" : "이용권 구매";
  const tagline = "회원권 · 수강권 · 공부 · 교육을 한 곳에서";

  // 이 이미지에서 실제로 렌더링되는 텍스트만 서브셋으로 로드
  const allText = [
    "모두의 지도사",
    headline,
    subhead,
    tagline,
    ...PILLS,
    "moducm.com",
  ].join(" ");

  const [regular, bold, extra, logoUrl] = await Promise.all([
    loadKoreanFont(allText, 400),
    loadKoreanFont(allText, 700),
    loadKoreanFont(allText, 800),
    loadLogoDataUrl(),
  ]);

  const fonts: Array<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" }> = [];
  if (regular) fonts.push({ name: "NotoKR", data: regular, weight: 400, style: "normal" });
  if (bold) fonts.push({ name: "NotoKR", data: bold, weight: 700, style: "normal" });
  if (extra) fonts.push({ name: "NotoKR", data: extra, weight: 800, style: "normal" });

  const COLORS = {
    // 홈페이지 톤에 맞춘 베이지 그라디언트 (nav #F8F4EC → accent #EFE7D5)
    bgFrom: "#F8F4EC",
    bgTo: "#E8E0D0",
    cardBg: "#FEFCF7",
    text: "#2A251D",
    sub: "#6B5D47",
    accent: "#6B7B3A",
    pillBg: "#EFE7D5",
    pillText: "#3A342A",
    footer: "#6B5D47",
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "32px",
          background: `linear-gradient(135deg, ${COLORS.bgFrom} 0%, ${COLORS.bgTo} 100%)`,
          fontFamily: "NotoKR, sans-serif",
        }}
      >
        {/* 메인 카드 — 좌: 텍스트+pills / 우: 로고 */}
        <div
          style={{
            flex: 1,
            background: COLORS.cardBg,
            borderRadius: 32,
            padding: "56px 60px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 48,
            boxShadow: "0 12px 40px rgba(107,93,71,0.18)",
            border: "1px solid rgba(232,224,208,0.9)",
          }}
        >
          {/* 좌측: 텍스트 + pills (수직 space-between) */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* 카테고리 칩 — 이용권 구매 / 회원 초대 강조 */}
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  padding: "12px 24px",
                  background: COLORS.accent,
                  color: "#FEFCF7",
                  fontSize: 30,
                  fontWeight: 800,
                  borderRadius: 999,
                  letterSpacing: 0.5,
                  boxShadow: "0 6px 18px rgba(107,123,58,0.28)",
                }}
              >
                {subhead}
              </div>
              <span
                style={{
                  marginTop: 20,
                  fontSize: 60,
                  fontWeight: 800,
                  color: COLORS.text,
                  lineHeight: 1.15,
                  display: "flex",
                }}
              >
                {headline}
              </span>
              <span
                style={{
                  marginTop: 20,
                  fontSize: 26,
                  fontWeight: 400,
                  color: COLORS.sub,
                  lineHeight: 1.4,
                  display: "flex",
                }}
              >
                {tagline}
              </span>
            </div>

            {/* 4개 pill (회원권·수강권·공부·교육) */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {PILLS.map((p) => (
                <span
                  key={p}
                  style={{
                    padding: "12px 22px",
                    background: COLORS.pillBg,
                    color: COLORS.pillText,
                    borderRadius: 14,
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* 우측: 로고 */}
          {logoUrl && (
            <div
              style={{
                width: 300,
                height: 300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#F5F0E5",
                borderRadius: 32,
                padding: 24,
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                width={252}
                height={252}
                style={{ objectFit: "contain", borderRadius: 20 }}
              />
            </div>
          )}
        </div>

        {/* 하단 도메인 */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "flex-end",
            color: COLORS.footer,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          moducm.com
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length ? fonts : undefined,
    }
  );
}
