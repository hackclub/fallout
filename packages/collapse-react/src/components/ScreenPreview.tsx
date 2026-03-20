import React from "react";

export interface ScreenPreviewProps {
  imageUrl: string | null;
}

export function ScreenPreview({ imageUrl }: ScreenPreviewProps) {
  if (!imageUrl) return null;

  return (
    <div style={styles.container}>
      <img src={imageUrl} alt="Last captured screenshot" style={styles.image} />
      <span style={styles.label}>Latest screenshot</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    background: "#111",
    border: "1px solid #333",
  },
  image: { width: "100%", display: "block" },
  label: {
    position: "absolute",
    bottom: 8,
    right: 8,
    fontSize: 12,
    color: "#aaa",
    background: "rgba(0,0,0,0.7)",
    padding: "2px 8px",
    borderRadius: 4,
  },
};
