import type { Metadata } from "next";
import AuthForm from "@/components/customer/AuthForm";
import { AuthAside, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a secure password reset link for your Naamly account.",
};

export default function ForgotPasswordPage() {
  return (
    <div className={styles.authPage}>
      <div className={styles.authShell}>
        <AuthAside mode="forgot" />
        <AuthForm mode="forgot" />
      </div>
    </div>
  );
}
