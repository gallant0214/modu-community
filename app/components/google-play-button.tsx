"use client";

const COMMUNITY_GOOGLE_PLAY =
  "https://play.google.com/store/apps/details?id=com.moduji.app";

const GooglePlayIcon = () => (
  <svg className="lp-badge-icon" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.18 23.76c.34.17.72.24 1.1.17.27-.05.53-.15.77-.3l7.94-4.56-3.22-3.2-6.8 6.76c-.12.12-.18.28-.16.44.03.24.16.47.37.6v.09zM.47 21.27c.02.11.05.22.09.33l.02.02c.03-.05.06-.1.1-.14l7.3-7.26L.9 7.18c-.28.39-.44.86-.44 1.35l.01 12.74zM20.89 11.32L17.3 9.26l-3.65 3.63 3.65 3.63 3.59-2.06c.68-.4 1.09-1.12 1.09-1.91v-.32c-.1-.48-.41-.89-.84-1.12l-.25.21zM4.55.26C4.3.1 4.02.02 3.73 0c-.37-.03-.73.09-1.01.32l-.05.05 9.89 9.83 3.23-3.2L5.33.56c-.25-.14-.51-.24-.78-.3z" />
  </svg>
);

export function GooglePlayButton({
  href = COMMUNITY_GOOGLE_PLAY,
  track = "google_play",
  comingSoon = false,
}: {
  href?: string;
  track?: string;
  comingSoon?: boolean;
}) {
  // 심사중(출시 전): 클릭 불가 배지 + '심사중' 표시
  if (comingSoon) {
    return (
      <span className="lp-badge-btn" aria-disabled="true" style={{ opacity: 0.55, cursor: "default", position: "relative" }}>
        <GooglePlayIcon />
        <span>
          <span className="lp-badge-sub">GET IT ON</span>
          <span className="lp-badge-main">Google Play</span>
        </span>
        <span
          style={{
            position: "absolute",
            top: -8,
            right: -6,
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            padding: "3px 6px",
            borderRadius: 999,
            background: "#EA7A3C",
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          심사중
        </span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => {
        fetch("/api/track-store-click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store: track }),
        }).catch(() => {});
      }}
      className="lp-badge-btn"
    >
      <GooglePlayIcon />
      <span>
        <span className="lp-badge-sub">GET IT ON</span>
        <span className="lp-badge-main">Google Play</span>
      </span>
    </a>
  );
}
