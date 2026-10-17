import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Naamly home">
      <span className="brand-mark" aria-hidden="true">
        <span>N</span>
      </span>
      {!compact && <span className="brand-name">naamly<span>.</span></span>}
    </Link>
  );
}
