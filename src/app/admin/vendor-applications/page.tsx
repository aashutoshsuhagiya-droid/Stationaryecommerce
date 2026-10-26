import type { Metadata } from "next";

import { MarketplaceSettingsPanel } from "@/components/admin/MarketplaceSettingsPanel";
import { VendorApplicationsPanel } from "@/components/admin/VendorApplicationsPanel";
import { VendorRegistrationOptionsPanel } from "@/components/admin/VendorRegistrationOptionsPanel";

export const metadata: Metadata = {
  title: "Vendor applications | Naamly Admin",
};

export default function VendorApplicationsPage() {
  return (
    <>
      <VendorApplicationsPanel />
      <VendorRegistrationOptionsPanel />
      <MarketplaceSettingsPanel />
    </>
  );
}
