import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <section className="shell not-found-page"><SearchX /><span className="eyebrow">404 · Lost label</span><h1>That page isn’t in this pack.</h1><p>The link may have changed, or the product is no longer available.</p><div><Link href="/products" className="button button-primary">Browse products</Link><Link href="/" className="button button-secondary">Back home</Link></div></section>;
}
