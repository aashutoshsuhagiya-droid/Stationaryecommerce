import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VendorDashboard } from "@/components/vendor/VendorDashboard";
import { getPageActor } from "@/lib/auth-session";
import { categories } from "@/lib/data";
import { getVendorApplicationForUser } from "@/lib/vendor-onboarding";

export const metadata: Metadata = {
  title: "Partner dashboard",
  description: "Track your Naamly printing partner application and operational approval status.",
};

export default async function VendorPage() {
  const actor = await getPageActor();

  if (!actor) {
    redirect("/login?next=/vendor");
  }

  const hasVendorAccess = actor.roles.some((role) => role === "vendor" || role === "vendor_applicant");
  if (!hasVendorAccess) {
    redirect("/");
  }

  const application = await getVendorApplicationForUser(actor.userId);
  if (!application) {
    redirect("/");
  }

  const categoryOptions = categories
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ id, name, description }) => ({ id, name, description }));

  return <VendorDashboard application={application} categories={categoryOptions} email={actor.email} />;
}
