import type { Metadata } from "next";

import { VendorApplicationsPanel } from "@/components/admin/VendorApplicationsPanel";

export const metadata: Metadata = {
  title: "Vendor applications | Naamly Admin",
};

export default function VendorApplicationsPage() {
  return <VendorApplicationsPanel />;
}
