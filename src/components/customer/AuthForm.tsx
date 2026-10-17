"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import styles from "./customer.module.css";

type Mode = "login" | "register" | "forgot";

export default function AuthForm({ mode }: { mode: Mode }) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (mode === "forgot" && submitted) {
    return (
      <div className={styles.formSuccess} role="status">
        <span><CheckCircle2 aria-hidden="true" /></span>
        <p className={styles.eyebrow}>Request received in this preview</p>
        <h1>Password delivery needs to be connected</h1>
        <p>The storefront captured the request for <strong>{email}</strong>, but this preview does not send email. A live reset must be issued by the configured authentication service using a short-lived, single-use link.</p>
        <Link className={styles.primaryButton} href="/login">Back to sign in <ArrowRight aria-hidden="true" /></Link>
      </div>
    );
  }

  return (
    <form className={styles.authForm} onSubmit={handleSubmit}>
      <div className={styles.formIntro}>
        <p className={styles.eyebrow}>{mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Password help"}</p>
        <h1>{mode === "login" ? "Sign in to Naamly" : mode === "register" ? "A more personal way to shop" : "Reset your password"}</h1>
        <p>{mode === "login" ? "Enter your details to continue to your account." : mode === "register" ? "A few details now make every next order simpler." : "Enter the email used for your account and we’ll send recovery instructions."}</p>
      </div>

      {mode === "register" && (
        <div className={styles.field}>
          <label htmlFor="full-name">Full name</label>
          <div className={styles.inputWithIcon}><UserRound aria-hidden="true" /><input id="full-name" name="name" autoComplete="name" placeholder="Your full name" required /></div>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="email">Email address</label>
        <div className={styles.inputWithIcon}><Mail aria-hidden="true" /><input id="email" type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
      </div>

      {mode !== "forgot" && (
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="password">Password</label>
            {mode === "login" && <Link href="/forgot-password">Forgot password?</Link>}
          </div>
          <div className={styles.inputWithIcon}>
            <LockKeyhole aria-hidden="true" />
            <input id="password" type={showPassword ? "text" : "password"} name="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" required />
            <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {mode === "register" && <small className={styles.fieldHint}>Use 8 or more characters and avoid a reused password.</small>}
        </div>
      )}

      {mode === "register" && (
        <label className={styles.consentRow}>
          <input type="checkbox" name="terms" required />
          <span>I agree to Naamly’s <Link href="/policies/terms">terms</Link> and acknowledge the <Link href="/policies/privacy">privacy policy</Link>.</span>
        </label>
      )}

      {mode === "login" && (
        <label className={styles.rememberRow}><input type="checkbox" name="remember" /><span>Keep me signed in on this device</span></label>
      )}

      <button className={styles.submitButton} type="submit">
        {mode === "login" ? "Sign in securely" : mode === "register" ? "Create account" : "Send reset link"}<ArrowRight aria-hidden="true" />
      </button>

      {mode !== "forgot" && submitted && (
        <p className={styles.fieldHint} role="status">
          {mode === "login"
            ? "Sign-in is not connected in this preview. Configure the authentication service before using customer accounts."
            : "Account creation is not connected in this preview. Configure the authentication service before accepting registrations."}
        </p>
      )}

      <p className={styles.formSwitch}>
        {mode === "login" ? <>New to Naamly? <Link href="/register">Create an account</Link></> : mode === "register" ? <>Already have an account? <Link href="/login">Sign in</Link></> : <>Remembered it? <Link href="/login">Back to sign in</Link></>}
      </p>
    </form>
  );
}
