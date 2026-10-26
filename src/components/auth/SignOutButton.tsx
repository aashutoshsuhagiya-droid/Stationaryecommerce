"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import styles from "./sign-out-button.module.css";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) throw new Error("Sign out failed");

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className={styles.signOutArea}>
      <button className={`${styles.signOutButton} ${compact ? styles.compact : ""}`} disabled={pending} onClick={signOut} type="button">
        <LogOut aria-hidden="true" size={16} />
        <span>{pending ? "Signing out…" : "Sign out"}</span>
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
