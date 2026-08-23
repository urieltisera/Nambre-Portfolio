import { ImageResponse } from "next/og";

export const alt = "Nambre, carta digital y QR para tu negocio";
export const contentType = "image/png";
export const size = {
  height: 630,
  width: 1200,
};

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "linear-gradient(135deg, #0b5f5b 0%, #087f7b 55%, #d8f1ee 100%)",
          color: "#f4fffe",
          display: "flex",
          height: "100%",
          justifyContent: "space-between",
          padding: "64px 72px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            justifyContent: "space-between",
            width: "68%",
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              border: "2px solid rgba(244,255,254,0.35)",
              borderRadius: "999px",
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              padding: "12px 22px",
            }}
          >
            Nambre
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
              Tu carta digital, siempre al dia.
            </div>
            <div style={{ color: "rgba(244,255,254,0.88)", fontSize: 30, lineHeight: 1.35 }}>
              Actualiza tu menu, comparte un QR permanente y mantene la experiencia de tu negocio
              alineada con tu marca.
            </div>
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.24)",
            borderRadius: 36,
            display: "flex",
            justifyContent: "center",
            minWidth: 250,
            padding: "24px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "#f4fffe",
              borderRadius: 28,
              color: "#087f7b",
              display: "flex",
              fontSize: 88,
              fontWeight: 900,
              height: 180,
              justifyContent: "center",
              width: 180,
            }}
          >
            N
          </div>
        </div>
      </div>
    ),
    size,
  );
}
