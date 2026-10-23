import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/customer/AuthForm";
import { AuthAside, styles } from "@/components/customer/CustomerUI";
import { getPageActor } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to view your Naamly orders, saved designs and account details.",
};

export default async function LoginPage() {
  const actor = await getPageActor();
  if (actor?.roles.includes("admin")) redirect("/admin");
  if (actor?.roles.some((role) => role === "vendor" || role === "vendor_applicant")) redirect("/vendor");
  if (actor) redirect("/account");

  return (
    <div className={styles.authPage}>
      <div className={styles.authShell}>
        <AuthAside mode="login" />
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
