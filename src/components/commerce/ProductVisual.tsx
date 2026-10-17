import type { CSSProperties } from "react";

type ProductVisualProps = {
  artwork?: string;
  name?: string;
  accent?: string;
  background?: string;
  className?: string;
  personalisedName?: string;
};

function visualKind(artwork = "") {
  const value = artwork.toLowerCase();
  if (value.includes("bottle") || value.includes("water")) return "bottle";
  if (value.includes("pencil") || value.includes("writing")) return "pencil";
  if (value.includes("notebook") || value.includes("book")) return "notebook";
  if (value.includes("gift") || value.includes("keychain") || value.includes("plate")) return "gift";
  return "labels";
}

export function ProductVisual({ artwork, name = "Personalised product", accent = "#52b7aa", background = "#e8f5f2", className = "", personalisedName = "Aarav M." }: ProductVisualProps) {
  const kind = visualKind(artwork);
  const style = { "--pv-accent": accent, "--visual-bg": background } as CSSProperties;

  return (
    <div className={`product-visual ${className}`} style={style} role="img" aria-label={name}>
      <span className="pv-shadow" />
      {kind === "labels" && <div className="pv-label-stack" aria-hidden="true">
        <div className="pv-label"><i>✦</i><span>{personalisedName}</span></div>
        <div className="pv-label"><i>●</i><span>{personalisedName}</span></div>
        <div className="pv-label"><i>▲</i><span>{personalisedName}</span></div>
      </div>}
      {kind === "bottle" && <div className="pv-bottle" data-name={personalisedName} aria-hidden="true" />}
      {kind === "pencil" && <div aria-hidden="true"><div className="pv-pencil one"><span>{personalisedName}</span></div><div className="pv-pencil two"><span>{personalisedName}</span></div><div className="pv-pencil three"><span>{personalisedName}</span></div></div>}
      {kind === "notebook" && <div className="pv-notebook" data-name={personalisedName} aria-hidden="true" />}
      {kind === "gift" && <div aria-hidden="true"><div className="pv-gift-lid" /><div className="pv-gift" data-name={personalisedName} /></div>}
      <span className="pv-tag">made for you</span>
    </div>
  );
}
