"use client";

import { useState } from "react";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setMessage("Preview only — connect a consent-aware email provider to activate subscriptions.");
  }

  return <form className="newsletter-form" onSubmit={submit}><label className="sr-only" htmlFor="newsletter-email">Email address</label><input id="newsletter-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /><button className="button button-amber" type="submit">Join the list</button><small role="status">{message || "By subscribing, you consent to email and can unsubscribe anytime. Demo mode does not save your address."}</small></form>;
}
