import type { Metadata } from "next";
import PolicyPage from "@/components/customer/PolicyPage";

export const metadata: Metadata = { title: "Terms & conditions", description: "Terms for using Naamly and ordering personalised products." };

export default function TermsPolicyPage() {
  return (
    <PolicyPage title="Terms & conditions" lead="These terms govern use of the Naamly storefront and orders placed through it. The live business should add its legal entity name, registered address, tax details and governing-jurisdiction language after qualified review.">
      <h2>1. Using the website</h2>
      <p>You may use the website for lawful personal or authorised business purposes. Do not attempt to disrupt the service, bypass security, scrape protected content, submit malicious files, misuse another person’s account or place fraudulent orders.</p>
      <h2>2. Product information</h2>
      <p>Naamly aims to describe products, materials, dimensions, pack quantities, care and production estimates accurately. Screen settings and material characteristics can produce small colour or scale differences. Images are illustrative unless expressly identified as a photograph of the exact item.</p>
      <h2>3. Personalisation responsibility</h2>
      <p>You are responsible for reviewing all entered text, spelling, capitalisation, selected design, product options and preview before ordering. You confirm that submitted names, images, logos or other content can lawfully be used for the requested purpose and do not infringe another person’s rights.</p>
      <h2>4. Pricing and payment</h2>
      <p>The order summary shows product price, options, applicable taxes, shipping and accepted discounts before payment. Prices or availability may change until an order is placed. A browser success screen alone does not confirm payment; the server and payment provider must verify the transaction.</p>
      <h2>5. Order acceptance</h2>
      <p>An automated acknowledgement means the request was received, not that every order can be produced. Naamly may contact you about unsupported personalisation, a clear pricing error, unavailable material, suspected fraud or another material issue. If an accepted payment cannot be fulfilled, the appropriate cancellation and refund process will be explained.</p>
      <h2>6. Production, changes and cancellation</h2>
      <p>Personalised production may begin soon after payment or required approval. Change or cancellation requests are reviewed but cannot be guaranteed once artwork generation, material allocation or production begins. The applicable conditions are detailed in the returns and refunds policy.</p>
      <h2>7. Delivery</h2>
      <p>Production and transit estimates are not guaranteed appointments unless expressly stated. You must provide an accurate, serviceable address and reasonable delivery access. Carrier events outside direct control are handled according to the shipping policy and applicable law.</p>
      <h2>8. Intellectual property</h2>
      <p>The Naamly brand, interface, product designs, text, graphics and original templates are protected by applicable rights and cannot be copied or commercially reused without permission. Customer content remains the customer’s content; you grant the limited permission needed to preview, produce, deliver and support the requested item.</p>
      <h2>9. Reviews and user content</h2>
      <p>If you submit a review or product photograph, it must reflect a genuine experience, respect privacy and avoid unlawful or abusive material. Publication may be moderated. Verified-purchase status is shown only when the purchase can be matched reliably.</p>
      <h2>10. Liability and legal rights</h2>
      <p>Nothing in these terms excludes rights or remedies that cannot lawfully be excluded. To the extent permitted by law, liability is limited to reasonably foreseeable loss arising from the affected transaction. Naamly is not responsible for loss caused by misuse, unauthorised account access due to shared credentials or content supplied without the required rights.</p>
      <h2>11. Changes and contact</h2>
      <p>Updated terms are dated when published and apply prospectively unless law requires otherwise. Questions can be sent to <a href="mailto:hello@naamly.in">hello@naamly.in</a> or through the <a href="/contact">contact page</a>.</p>
    </PolicyPage>
  );
}
