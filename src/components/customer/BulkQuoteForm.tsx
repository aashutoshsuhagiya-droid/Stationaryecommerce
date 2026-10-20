"use client";

import { FormEvent, useState } from "react";
import { Building2, CheckCircle2, LoaderCircle, Paperclip } from "lucide-react";

import BulkPersonalizationCsv, {
  type BulkPersonalizationSelection,
} from "./BulkPersonalizationCsv";
import styles from "./customer.module.css";

export interface BulkProductOption {
  id: string;
  name: string;
  dimensions: string;
  material: string;
  supportsMultipleNames: boolean;
}

type SubmissionResult = {
  data?: { reference: string; status: "received"; receivedAt: string };
  error?: { message?: string; details?: Array<{ path?: string; message?: string }> };
};

const emptyPersonalization: BulkPersonalizationSelection = {
  rows: [],
  allowDuplicateNames: false,
  isValid: true,
  totalQuantity: 0,
};

export default function BulkQuoteForm({
  products,
  initialProductId,
  customSize = false,
  minimumQuantity,
  maximumQuantity,
}: {
  products: BulkProductOption[];
  initialProductId?: string;
  customSize?: boolean;
  minimumQuantity: number;
  maximumQuantity: number;
}) {
  const initialProduct = products.find((option) => option.id === initialProductId);
  const [selectedProductId, setSelectedProductId] = useState(initialProduct?.id ?? "");
  const [dimensions, setDimensions] = useState(customSize ? "" : initialProduct?.dimensions ?? "");
  const [material, setMaterial] = useState(initialProduct?.material ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [personalization, setPersonalization] = useState<BulkPersonalizationSelection>(emptyPersonalization);
  const selectedProduct = products.find((option) => option.id === selectedProductId);

  function selectProduct(productId: string) {
    const product = products.find((option) => option.id === productId);
    setSelectedProductId(productId);
    setDimensions(product?.dimensions ?? "");
    setMaterial(product?.material ?? "");
    setPersonalization(emptyPersonalization);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const quantity = Number(formData.get("quantity"));
    if (selectedProduct?.supportsMultipleNames && !personalization.isValid) {
      setError("Fix the CSV name-list issues before submitting this request.");
      return;
    }
    if (selectedProduct?.supportsMultipleNames && personalization.totalQuantity > quantity) {
      setError("The name-list quantity cannot be greater than the estimated order quantity.");
      return;
    }
    setSubmitting(true);
    const body = {
      customerName: formData.get("customerName"),
      businessName: formData.get("businessName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      productId: formData.get("productId"),
      dimensions: formData.get("dimensions"),
      quantity,
      material: formData.get("material"),
      printing: formData.get("printing"),
      finishing: formData.get("finishing"),
      postcode: formData.get("postcode"),
      notes: formData.get("notes"),
      personalizationRows: selectedProduct?.supportsMultipleNames ? personalization.rows : [],
      allowDuplicateNames:
        selectedProduct?.supportsMultipleNames && personalization.allowDuplicateNames,
      acceptedPrivacy: formData.get("acceptedPrivacy") === "on",
    };

    try {
      const response = await fetch("/api/bulk-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as SubmissionResult;
      if (!response.ok || !payload.data) {
        const firstIssue = payload.error?.details?.find((detail) => detail.message)?.message;
        throw new Error(firstIssue ?? payload.error?.message ?? "The request could not be submitted.");
      }
      setReference(payload.data.reference);
      form.reset();
      setSelectedProductId("");
      setDimensions("");
      setMaterial("");
      setPersonalization(emptyPersonalization);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The request could not be submitted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <section className={styles.bulkForm} aria-labelledby="bulk-form-title">
        <div className={styles.quoteSuccess} role="status">
          <CheckCircle2 aria-hidden="true" />
          <p className={styles.eyebrow}>Request received</p>
          <h2 id="bulk-form-title">Your brief has been recorded</h2>
          <p>Reference <strong className={styles.referenceCode}>{reference}</strong></p>
          <p>This preview stores the request only for the current server process. It has not been sent to a sales or production system.</p>
          <button className={styles.secondaryButton} type="button" onClick={() => setReference("")}>Submit another request</button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.bulkForm} aria-labelledby="bulk-form-title">
      <h2 id="bulk-form-title">Request a bulk quote</h2>
      <p>{customSize ? "Enter the required dimensions for a manufacturing and pricing review. Custom sizes cannot be purchased until feasibility is confirmed." : "Share your specification for a feasibility and pricing review. No order is created at this stage."}</p>
      <form onSubmit={submit}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="bulk-customer">Contact name</label>
            <input id="bulk-customer" name="customerName" autoComplete="name" minLength={2} maxLength={100} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-business">Business or organisation</label>
            <input id="bulk-business" name="businessName" autoComplete="organization" minLength={2} maxLength={120} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-email">Work email</label>
            <input id="bulk-email" name="email" type="email" autoComplete="email" maxLength={254} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-phone">Phone number</label>
            <input id="bulk-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit Indian mobile" pattern="[+0-9 ()-]{10,18}" required />
          </div>
          <div className={`${styles.field} ${styles.fullSpan}`}>
            <label htmlFor="bulk-product">Catalog product</label>
            <select id="bulk-product" name="productId" value={selectedProductId} onChange={(event) => selectProduct(event.target.value)} required>
              <option value="" disabled>Select a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.supportsMultipleNames ? " - CSV name list supported" : ""}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-dimensions">Required dimensions</label>
            <input id="bulk-dimensions" name="dimensions" value={dimensions} onChange={(event) => setDimensions(event.target.value)} minLength={2} maxLength={120} placeholder="For example, 50 x 15 mm" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-quantity">Estimated quantity</label>
            <input id="bulk-quantity" name="quantity" type="number" inputMode="numeric" min={minimumQuantity} max={maximumQuantity} step={1} placeholder="For example, 250" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-material">Preferred material</label>
            <input id="bulk-material" name="material" value={material} onChange={(event) => setMaterial(event.target.value)} minLength={2} maxLength={120} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-printing">Printing</label>
            <select id="bulk-printing" name="printing" defaultValue="" required>
              <option value="" disabled>Select printing</option>
              <option value="full-colour">Full colour</option>
              <option value="single-colour">Single colour</option>
              <option value="not-sure">Not sure yet</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-finishing">Finishing</label>
            <select id="bulk-finishing" name="finishing" defaultValue="" required>
              <option value="" disabled>Select finishing</option>
              <option value="matte">Matte</option>
              <option value="gloss">Gloss</option>
              <option value="standard">Standard catalog finish</option>
              <option value="not-sure">Not sure yet</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="bulk-postcode">Delivery PIN code</label>
            <input id="bulk-postcode" name="postcode" inputMode="numeric" autoComplete="postal-code" pattern="[1-9][0-9]{5}" maxLength={6} placeholder="6-digit PIN code" required />
          </div>
          <div className={`${styles.field} ${styles.fullSpan}`}>
            <label htmlFor="bulk-notes">Project notes <span aria-hidden="true">(optional)</span></label>
            <textarea id="bulk-notes" name="notes" maxLength={1500} placeholder="Names or variants needed, delivery plan, artwork details, timing, or other requirements." />
          </div>
          {selectedProduct?.supportsMultipleNames && (
            <BulkPersonalizationCsv
              key={selectedProduct.id}
              onChange={setPersonalization}
            />
          )}
          <div className={`${styles.attachmentNotice} ${styles.fullSpan}`}>
            <Paperclip aria-hidden="true" />
            <div><strong>Artwork attachments are unavailable in this demo</strong><p>Name-list CSV files are parsed locally and submitted as validated rows. Logos and other artwork still require private storage, malware scanning, and access controls before launch.</p></div>
          </div>
          <label className={`${styles.consentRow} ${styles.fullSpan}`}>
            <input type="checkbox" name="acceptedPrivacy" required />
            <span>I consent to Naamly using these details to review and respond to this quote request.</span>
          </label>
        </div>

        {error && <div className={styles.formError} role="alert">{error}</div>}
        <button className={styles.submitButton} type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><LoaderCircle className={styles.spin} aria-hidden="true" /> Submitting request...</> : <><Building2 aria-hidden="true" /> Submit quote request</>}
        </button>
        <p className={styles.helperText}>Submitting creates a temporary demo record only. Pricing and production dates remain subject to review.</p>
      </form>
    </section>
  );
}
