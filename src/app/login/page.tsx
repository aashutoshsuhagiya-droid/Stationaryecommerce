import type { Metadata } from "next";
import AuthForm from "@/components/customer/AuthForm";
import { AuthAside, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to view your Naamly orders, saved designs and account details.",
};

export default function LoginPage() {
  return (
    <div className={styles.authPage}>
      <div className={styles.authShell}>
        <AuthAside mode="login" />
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
