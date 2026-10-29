import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VendorDashboard } from "@/components/vendor/VendorDashboard";
import { getPageActor } from "@/lib/auth-session";
import { getVendorCategoryGroups } from "@/lib/runtime-catalog";
import { getVendorApplicationForUser } from "@/lib/vendor-onboarding";

export const metadata: Metadata = {
  title: "Partner dashboard",
  description: "Track your Naamly printing partner application and operational approval status.",
};

export const dynamic = "force-dynamic";

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

  const categoryGroups = await getVendorCategoryGroups();

  return <VendorDashboard application={application} categoryGroups={categoryGroups} email={actor.email} />;
}
