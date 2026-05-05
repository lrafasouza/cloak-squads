import { ImageResponse } from "next/og";

/*
 * Apple Touch Icon — Brand Deliverable §01
 * 180×180 app icon for iOS home screen.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0c",
          borderRadius: "50%",
          border: "1px solid #1f1f25",
        }}
      >
        <span
          style={{
            fontFamily: "Georgia, serif",
            fontWeight: 600,
            fontSize: 74,
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
