import { ImageResponse } from "next/og";

/*
 * Favicon — Brand Deliverable §01
 * 32×32 PNG fallback for desktop browsers.
 * Next.js App Router auto-injects <link rel="icon"> at /icon.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0c",
          borderRadius: 7,
          border: "1px solid #1f1f25",
        }}
      >
        <span
          style={{
            fontFamily: "serif",
            fontSize: 22,
            color: "#d4b87a",
            lineHeight: 1,
          }}
        >
          Æ
        </span>
      </div>
    ),
    { ...size },
  );
}
