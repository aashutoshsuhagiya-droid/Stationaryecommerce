import type { Metadata } from "next";
import PolicyPage from "@/components/customer/PolicyPage";

export const metadata: Metadata = { title: "Returns & refunds", description: "Naamly cancellation, return, replacement and refund conditions." };

export default function ReturnsPolicyPage() {
  return (
    <PolicyPage title="Returns & refunds" lead="Personalised goods are made to the information you approve, so they cannot always be resold or returned for a change of mind. This does not limit remedies available for a damaged, defective or incorrectly produced item under applicable law.">
      <h2>1. Before you place an order</h2>
      <p>Review spelling, capitalisation, product size, pack quantity, material, design, colour and delivery information. Naamly saves the submitted configuration with the order so any reported issue can be compared with what was approved.</p>
      <h2>2. Cancellation requests</h2>
      <p>Contact support as soon as possible. A personalised order can be cancelled only if the request is accepted before artwork review, material allocation or production begins. A request is not confirmed until support responds in writing. Non-personalised items may be cancellable before dispatch.</p>
      <h2>3. Change-of-mind returns</h2>
      <p>A correctly produced personalised item is generally not eligible for return or exchange because it was made for a specific customer. A non-personalised, unused item may be eligible if the product page permits returns and it is sent back in original condition within the stated window.</p>
      <h2>4. Damaged, defective or incorrect items</h2>
      <p>Contact support promptly after delivery and provide the order number, a clear description, photographs of the product and packaging, and the shipping label where requested. Keep the item and all packaging until the review is complete.</p>
      <p>An incorrect item means the received item differs materially from the saved order configuration. A customer-entered spelling error, an expected screen-to-print colour variation or normal material tolerance is not automatically a production error.</p>
      <h2>5. Available resolution</h2>
      <p>After review, the appropriate resolution may be guidance, repair where suitable, replacement, partial refund or full refund. The remedy depends on the issue, the affected quantity, stock or production feasibility and applicable consumer law. Return shipping instructions are provided when a physical return is required.</p>
      <h2>6. Refund processing</h2>
      <p>Approved refunds are sent to the original payment method unless another lawful method is agreed. Naamly will confirm when a refund is initiated; the time for it to appear is then determined by the bank or payment provider. Shipping charges are refunded only when required by the approved resolution or applicable law.</p>
      <h2>7. Items not accepted for return</h2>
      <ul><li>Correctly made personalised goods returned because of a change of mind.</li><li>Items damaged by incorrect application, use, washing, storage or care contrary to product instructions.</li><li>Items altered, used extensively or returned without the supplied components when those facts prevent a fair review.</li><li>Unauthorised returns sent without following the provided instructions.</li></ul>
      <h2>8. How to report an issue</h2>
      <p>Email <a href="mailto:hello@naamly.in">hello@naamly.in</a> or use the <a href="/contact">contact form</a>. Quote the order number and submit only information relevant to the case.</p>
    </PolicyPage>
  );
}
