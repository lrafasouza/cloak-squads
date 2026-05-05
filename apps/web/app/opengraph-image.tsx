import { ImageResponse } from "next/og";
import type { Metadata } from "next";

/*
 * Aegis OG Image — Brand Deliverable §04
 * 1200×630 with globe motif, grid, and lockup.
 */

export const alt = "Aegis — Private execution for shared treasuries";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const metadata: Metadata = {
  metadataBase: new URL("https://aegis.fi"),
};

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0a0a0c",
        }}
      >
        {/* Grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(212,184,122,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(212,184,122,0.05) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: 0.6,
          }}
        />

        {/* Globe — outer ring */}
        <div
          style={{
            position: "absolute",
            right: -180,
            bottom: -180,
            width: 640,
            height: 640,
            borderRadius: "50%",
            border: "1px solid rgba(212,184,122,0.18)",
          }}
        />
        {/* Globe — middle ring */}
        <div
          style={{
            position: "absolute",
            right: -120,
            bottom: -120,
            width: 520,
            height: 520,
            borderRadius: "50%",
            border: "1px solid rgba(212,184,122,0.10)",
          }}
        />
        {/* Globe — inner ring */}
        <div
          style={{
            position: "absolute",
            right: -60,
            bottom: -60,
            width: 360,
            height: 360,
            borderRadius: "50%",
            border: "1px solid rgba(212,184,122,0.06)",
          }}
        />

        {/* Dots */}
        <div
          style={{
            position: "absolute",
            right: 80,
            bottom: 340,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#d4b87a",
            boxShadow: "0 0 24px #d4b87a",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 240,
            bottom: 200,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#e7d3a3",
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 380,
            bottom: 380,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#d4b87a",
            opacity: 0.5,
          }}
        />

        {/* Top row: lockup + pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 48,
                fontWeight: 600,
                color: "#d4b87a",
                lineHeight: 1,
              }}
            >
              Æ
            </span>
            <span
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 32,
                fontWeight: 600,
                color: "#f4f1ec",
                lineHeight: 1,
              }}
            >
              Aegis
            </span>
          </div>

          {/* Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 18px",
              border: "1px solid #2a2a31",
              borderRadius: 999,
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#7a7a82",
              background: "rgba(15,15,18,0.6)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#d4b87a",
                boxShadow: "0 0 14px #d4b87a",
              }}
            />
            Devnet live
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flexDirection: "column", position: "relative", zIndex: 2, maxWidth: 780 }}>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontWeight: 600,
              fontSize: 84,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              margin: "0 0 28px",
              color: "#f4f1ec",
            }}
          >
            Private execution
            <br />
            for{" "}
            <span
              style={{
                color: "#d4b87a",
                fontStyle: "italic",
                fontWeight: 500,
              }}
            >
              shared treasuries.
            </span>
          </h1>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 22,
              lineHeight: 1.45,
              color: "#cfcfd6",
              maxWidth: 660,
              fontWeight: 400,
            }}
          >
            Single-use execution licenses for Squads multisigs on Solana — settle
            privately through Cloak Protocol.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#7a7a82",
            }}
          >
            aegis{" "}
            <span style={{ color: "#d4b87a", fontWeight: 500 }}>·</span> solana{" "}
            <span style={{ color: "#d4b87a", fontWeight: 500 }}>·</span> squads{" "}
            <span style={{ color: "#d4b87a", fontWeight: 500 }}>·</span> cloak
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
