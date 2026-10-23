import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getPageActor } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Admin | Naamly",
  description: "Naamly store operations and fulfillment workspace.",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getPageActor();
  if (!actor) redirect("/login?next=/admin");
  if (!actor.roles.includes("admin")) redirect("/");

  return <AdminShell>{children}</AdminShell>;
}
