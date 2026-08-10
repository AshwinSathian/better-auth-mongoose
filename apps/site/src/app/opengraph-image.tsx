import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "better-auth-mongoose — a Mongoose-native database adapter for Better Auth";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CANVAS = "#0c0b09";
const INK = "#f3f1e9";
const INK_SOFT = "#b3ae9f";
const ACCENT = "#ff8a3d";
const ACCENT_INK = "#1a0f05";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        backgroundColor: CANVAS,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: ACCENT,
            color: ACCENT_INK,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {"{}"}
        </div>
        <span style={{ fontSize: 28, color: INK_SOFT, fontFamily: "monospace" }}>
          better-auth-mongoose
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{ display: "flex", fontSize: 64, fontWeight: 700, color: INK, lineHeight: 1.15 }}
        >
          Better Auth&rsquo;s tables, as real Mongoose models.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: INK_SOFT }}>
          A Mongoose-native database adapter for Better Auth, plus a tenant-scoping plugin.
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 24, color: ACCENT, fontFamily: "monospace" }}>
        github.com/AshwinSathian/better-auth-mongoose
      </div>
    </div>,
    { ...size },
  );
}
