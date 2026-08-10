import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ff8a3d",
        borderRadius: 40,
      }}
    >
      <span style={{ fontSize: 84, fontWeight: 700, color: "#1a0f05" }}>{"{}"}</span>
    </div>,
    { ...size },
  );
}
