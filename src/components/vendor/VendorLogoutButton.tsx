"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import styles from "./vendor.module.css";

export function VendorLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logOut() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Sign out failed");
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className={styles.logoutArea}>
      <button className={styles.logoutButton} disabled={pending} onClick={logOut} type="button">
        <LogOut aria-hidden="true" size={16} />
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p className={styles.logoutError} role="alert">{error}</p>}
    </div>
  );
}
