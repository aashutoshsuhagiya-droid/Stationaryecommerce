import type { Metadata } from "next";
import AuthForm from "@/components/customer/AuthForm";
import { AuthAside, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a Naamly account to keep orders, addresses and saved personalised designs together.",
};

export default function RegisterPage() {
  return (
    <div className={styles.authPage}>
      <div className={styles.authShell}>
        <AuthAside mode="register" />
        <AuthForm mode="register" />
      </div>
    </div>
  );
}
