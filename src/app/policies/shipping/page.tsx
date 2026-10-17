import type { Metadata } from "next";
import PolicyPage from "@/components/customer/PolicyPage";

export const metadata: Metadata = { title: "Shipping policy", description: "Naamly production, dispatch, tracking and delivery policy." };

export default function ShippingPolicyPage() {
  return (
    <PolicyPage title="Shipping policy" lead="This policy explains how made-to-order production and carrier delivery work together. Product-specific estimates shown before checkout take priority over general guidance on this page.">
      <h2>1. Where we deliver</h2>
      <p>Naamly delivers to Indian addresses supported by the carriers enabled for the store. Serviceability is checked using the delivery PIN code. A product may be unavailable for some destinations because of size, handling or carrier restrictions.</p>
      <h2>2. Production before dispatch</h2>
      <p>Personalised items require production time before they can be shipped. The expected production window is displayed on the product page or during checkout when available. It begins after payment confirmation and after any required artwork or detail approval.</p>
      <ul><li>Orders with several products may dispatch together when all items are ready, unless split shipment is explicitly offered.</li><li>Customer response time for an artwork query is not included in the production estimate.</li><li>Peak demand, material availability or a failed quality check can extend production; affected customers should be informed using the contact details supplied at checkout.</li></ul>
      <h2>3. Shipping charges</h2>
      <p>Applicable shipping charges are shown before payment. Free shipping, a threshold offer or a special rate applies only when it is displayed in the order summary and its stated conditions are met.</p>
      <h2>4. Dispatch and tracking</h2>
      <p>An order is considered dispatched after it is handed to the delivery partner. Tracking information is provided when the carrier makes it available. The first scan may not appear immediately. Tracking is an estimate of carrier movement, not a guaranteed delivery appointment.</p>
      <h2>5. Address accuracy</h2>
      <p>Customers are responsible for reviewing the name, mobile number, PIN code and full delivery address before ordering. Contact support immediately if an address is incorrect. A change cannot be guaranteed after dispatch, and carrier fees for redirection or return may apply where permitted.</p>
      <h2>6. Delivery attempts and returned parcels</h2>
      <p>The carrier may contact the recipient or make more than one attempt according to its own operating policy. If a parcel is returned because an address was incomplete, the recipient was unavailable or delivery was refused, the team will explain any available reshipment and the applicable charge before proceeding.</p>
      <h2>7. Delay, loss or visible damage</h2>
      <p>If tracking is unusually delayed, contact support with the order number. For a parcel that appears opened or visibly damaged, photograph the outer packaging before opening where safe to do so and keep all packaging until the case is reviewed. Carrier investigations have their own timeframes and do not automatically determine the final customer resolution.</p>
      <h2>8. Contact</h2>
      <p>Email <a href="mailto:hello@naamly.in">hello@naamly.in</a> or use the <a href="/contact">contact form</a>. Include the order number and never send payment credentials or one-time codes.</p>
    </PolicyPage>
  );
}
