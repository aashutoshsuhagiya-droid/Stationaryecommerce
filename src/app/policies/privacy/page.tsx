import type { Metadata } from "next";
import PolicyPage from "@/components/customer/PolicyPage";

export const metadata: Metadata = { title: "Privacy policy", description: "How Naamly collects, uses and protects customer information." };

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage title="Privacy policy" lead="This policy describes the information Naamly processes to provide the storefront, create personalised products, fulfil orders and support customers. The live business should update controller identity, registered address and provider details before launch.">
      <h2>1. Information we collect</h2>
      <ul><li>Account details such as your name, email address, mobile number and password credential handled by the authentication service.</li><li>Order and delivery details including address, purchased items, saved personalisation, transaction status and support history.</li><li>Content you choose to provide, such as names to print, optional class details, artwork uploads, review text or bulk-order spreadsheets.</li><li>Technical and usage data such as browser type, device information, approximate location derived from IP address, cookie preferences and security logs.</li></ul>
      <h2>2. How we use information</h2>
      <p>Information is used to operate the store, validate and produce personalised items, process and verify payments, deliver orders, prevent abuse, respond to support requests, maintain required records and improve the service. Marketing messages are sent only with the applicable permission and include a way to opt out.</p>
      <h2>3. Personalisation data</h2>
      <p>Names, text and customer artwork are used to preview, produce and support the relevant order. Avoid entering sensitive information that is not necessary for the product. Production partners or authorised staff receive only the information needed to fulfil the item.</p>
      <h2>4. Payments</h2>
      <p>Payments are handled through the merchant’s configured payment provider. Naamly does not store raw card numbers or security codes. It may retain gateway references, method category, amount, verification result and refund information for accounting, support and fraud prevention.</p>
      <h2>5. When information is shared</h2>
      <p>Information may be shared with contracted providers that support hosting, authentication, payment processing, production, communications, storage, analytics or delivery. It may also be disclosed when required by law, to protect legal rights or as part of a properly managed business transfer. Providers should receive only what they need and be bound by suitable obligations.</p>
      <h2>6. Retention</h2>
      <p>Information is kept only as long as necessary for the purposes above, including fulfilment, dispute handling, legal, tax, accounting, security and backup requirements. Retention periods can differ by record type. Production files and unused uploads should be removed or de-identified when no longer required.</p>
      <h2>7. Cookies and analytics</h2>
      <p>Essential storage may be used for sessions, security, cart contents and preferences. Optional analytics or advertising technologies should run only in line with the consent choice and published cookie settings. You can also use browser controls, though disabling essential storage may affect site functions.</p>
      <h2>8. Your choices and rights</h2>
      <p>Subject to applicable law, you may ask to access or correct relevant personal information, withdraw consent where processing relies on it, opt out of marketing, or request deletion of information that no longer needs to be retained. Identity may need to be verified before a request is completed.</p>
      <h2>9. Security and children</h2>
      <p>Naamly uses reasonable organisational and technical safeguards, but no online system is risk-free. Accounts should use unique passwords and one-time codes should never be shared. Adults placing orders for children should provide only the minimum personalisation information necessary for the product.</p>
      <h2>10. Contact and grievances</h2>
      <p>For privacy questions or requests, email <a href="mailto:hello@naamly.in">hello@naamly.in</a>. The live policy should publish the legally required grievance contact and postal details before customer data is collected.</p>
    </PolicyPage>
  );
}
