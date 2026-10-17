"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Naamly route error", error); }, [error]);
  return <section className="shell route-error"><CircleAlert /><span className="eyebrow">Something paused</span><h1>We couldn’t load this page.</h1><p>Your saved cart and personalisation are still in this browser. Try the page again, or return to the collection.</p><div><button className="button button-primary" onClick={reset}><RotateCcw /> Try again</button><Link className="button button-secondary" href="/products">Browse products</Link></div></section>;
}
