"use client";

import { AlertCircle, CheckCircle2, FileUp, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import styles from "./vendor.module.css";

type CategoryOption = { id: string; name: string; description: string };
type DocumentType =
  | "BUSINESS_REGISTRATION"
  | "GST_CERTIFICATE"
  | "SHOP_LICENSE"
  | "IDENTITY_PROOF"
  | "ADDRESS_PROOF"
  | "OTHER";

type CorrectionValues = {
  ownerName: string;
  businessName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  servicePostalCodes: string[];
  serviceCategoryIds: string[];
  printingServices: string[];
  equipment: string[];
  businessRegistrationNumber: string;
  gstin: string;
};

type ApiIssue = { path?: string; message?: string };
type ApiBody = { data?: unknown; error?: { message?: string; details?: ApiIssue[] } };
type FormStatus = { tone: "error" | "success"; title: string; message: string };

const documentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: "BUSINESS_REGISTRATION", label: "Business registration" },
  { value: "GST_CERTIFICATE", label: "GST certificate" },
  { value: "SHOP_LICENSE", label: "Shop licence" },
  { value: "IDENTITY_PROOF", label: "Identity proof" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "OTHER", label: "Other supporting document" },
];

const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const acceptedDocumentTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

function uniqueList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function commaSeparated(value: string) {
  return uniqueList(value.split(/[\s,\n]+/));
}

function textList(value: string) {
  return uniqueList(value.split(/[,\n]+/));
}

function apiMessage(body: ApiBody, fallback: string) {
  return body.error?.message?.trim() || fallback;
}

export function VendorActionRequiredForm({
  application,
  categories,
  requestMessage,
}: {
  application: CorrectionValues;
  categories: CategoryOption[];
  requestMessage: string;
}) {
  const router = useRouter();
  const correctionStatusRef = useRef<HTMLDivElement>(null);
  const uploadStatusRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategories, setSelectedCategories] = useState(application.serviceCategoryIds);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [correctionStatus, setCorrectionStatus] = useState<FormStatus | null>(null);
  const [uploadStatus, setUploadStatus] = useState<FormStatus | null>(null);

  function focusStatus(ref: React.RefObject<HTMLDivElement | null>) {
    requestAnimationFrame(() => ref.current?.focus());
  }

  function toggleCategory(categoryId: string) {
    setSelectedCategories((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
    setFieldErrors((current) => ({ ...current, serviceCategoryIds: "" }));
  }

  async function submitCorrections(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCorrectionStatus(null);
    setFieldErrors({});

    if (!form.checkValidity()) {
      form.reportValidity();
      setCorrectionStatus({ tone: "error", title: "Check the form", message: "Complete the required business and address fields." });
      focusStatus(correctionStatusRef);
      return;
    }

    const values = new FormData(form);
    const value = (name: string) => String(values.get(name) ?? "").trim();
    const postalCode = value("postalCode");
    const servicePostalCodes = uniqueList([postalCode, ...commaSeparated(value("servicePostalCodes"))]);
    const printingServices = textList(value("printingServices"));
    const equipment = textList(value("equipment"));
    const gstin = value("gstin").toUpperCase();
    const errors: Record<string, string> = {};

    if (!selectedCategories.length || selectedCategories.length > 30) errors.serviceCategoryIds = "Select at least one service category.";
    if (servicePostalCodes.length > 50 || servicePostalCodes.some((code) => !/^[1-9][0-9]{5}$/.test(code))) {
      errors.servicePostalCodes = "Use up to 50 valid 6-digit Indian PIN codes.";
    }
    if (!printingServices.length || printingServices.length > 20 || printingServices.some((item) => item.length > 120)) {
      errors.printingServices = "Enter 1–20 printing services, with no more than 120 characters each.";
    }
    if (!equipment.length || equipment.length > 20 || equipment.some((item) => item.length > 120)) {
      errors.equipment = "Enter 1–20 equipment items, with no more than 120 characters each.";
    }
    if (gstin && !gstinPattern.test(gstin)) errors.gstin = "Enter a valid 15-character GSTIN.";

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setCorrectionStatus({ tone: "error", title: "Review the requested changes", message: "Some service or verification details still need attention." });
      focusStatus(correctionStatusRef);
      return;
    }

    const payload = {
      ownerName: value("ownerName"),
      businessName: value("businessName"),
      addressLine1: value("addressLine1"),
      addressLine2: value("addressLine2") || null,
      city: value("city"),
      state: value("state"),
      postalCode,
      servicePostalCodes,
      serviceCategoryIds: selectedCategories,
      printingServices,
      equipment,
      businessRegistrationNumber: value("businessRegistrationNumber") || null,
      gstin: gstin || null,
    };

    setSubmitting(true);
    try {
      const response = await fetch("/api/vendor/application", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.data) {
        const apiErrors = Object.fromEntries((body.error?.details ?? [])
          .filter((issue): issue is Required<Pick<ApiIssue, "path" | "message">> => Boolean(issue.path && issue.message))
          .map((issue) => [issue.path, issue.message]));
        setFieldErrors(apiErrors);
        throw new Error(apiMessage(body, "The corrected application could not be submitted."));
      }

      setCorrectionStatus({ tone: "success", title: "Corrections submitted", message: "Your application is back in the review queue." });
      focusStatus(correctionStatusRef);
      router.refresh();
    } catch (error) {
      setCorrectionStatus({
        tone: "error",
        title: "Corrections not submitted",
        message: error instanceof Error ? error.message : "Please try again.",
      });
      focusStatus(correctionStatusRef);
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("document");
    const documentType = String(values.get("documentType") ?? "") as DocumentType;
    setUploadStatus(null);

    if (!(file instanceof File) || !file.size) {
      setUploadStatus({ tone: "error", title: "Choose a document", message: "Select a PDF, PNG or JPEG file to upload." });
      focusStatus(uploadStatusRef);
      return;
    }
    if (!acceptedDocumentTypes.has(file.type) || file.size > 4 * 1024 * 1024) {
      setUploadStatus({ tone: "error", title: "Document not accepted", message: "Use a PDF, PNG or JPEG file no larger than 4 MB." });
      focusStatus(uploadStatusRef);
      return;
    }

    const submission = new FormData();
    submission.append("documents", file);
    submission.append("documentTypes", documentType);
    setUploading(true);

    try {
      const response = await fetch("/api/vendor/application/documents", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: submission,
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.data) throw new Error(apiMessage(body, "The document could not be uploaded."));

      form.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadStatus({ tone: "success", title: "Document uploaded", message: "The new document is attached to your application." });
      focusStatus(uploadStatusRef);
      router.refresh();
    } catch (error) {
      setUploadStatus({
        tone: "error",
        title: "Document not uploaded",
        message: error instanceof Error ? error.message : "Please try again.",
      });
      focusStatus(uploadStatusRef);
    } finally {
      setUploading(false);
    }
  }

  const statusBlock = (status: FormStatus | null, ref: React.RefObject<HTMLDivElement | null>) => status && (
    <div className={`${styles.actionFormStatus} ${status.tone === "success" ? styles.actionFormSuccess : styles.actionFormError}`} ref={ref} role={status.tone === "error" ? "alert" : "status"} tabIndex={-1}>
      {status.tone === "success" ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
      <span><strong>{status.title}</strong><small>{status.message}</small></span>
    </div>
  );

  return (
    <section className={styles.actionRequiredPanel} id="requested-changes" aria-labelledby="requested-changes-title">
      <div className={styles.actionRequiredHeading}>
        <div className={styles.actionRequiredIcon}><AlertCircle aria-hidden="true" size={22} /></div>
        <div>
          <p>Requested by the review team</p>
          <h2 id="requested-changes-title">Correct and resubmit your application</h2>
          <blockquote>{requestMessage}</blockquote>
        </div>
      </div>

      <div className={styles.actionFormsGrid}>
        <form className={styles.correctionForm} onSubmit={submitCorrections}>
          <div className={styles.actionFormIntro}>
            <div><span>Application corrections</span><h3>Business and service details</h3></div>
            <p>Submitting this form returns the application to <strong>Submitted</strong> for another review.</p>
          </div>
          {statusBlock(correctionStatus, correctionStatusRef)}

          <fieldset className={styles.actionFieldset}>
            <legend>Business</legend>
            <div className={styles.actionFieldGrid}>
              <label><span>Owner name</span><input defaultValue={application.ownerName} maxLength={120} minLength={2} name="ownerName" required /></label>
              <label><span>Business name</span><input defaultValue={application.businessName} maxLength={180} minLength={2} name="businessName" required /></label>
              <label><span>Registration number <small>Optional</small></span><input defaultValue={application.businessRegistrationNumber} maxLength={80} name="businessRegistrationNumber" /></label>
              <label><span>GSTIN <small>Optional</small></span><input aria-invalid={Boolean(fieldErrors.gstin)} defaultValue={application.gstin} maxLength={15} name="gstin" /></label>
              {fieldErrors.gstin && <small className={styles.actionFieldError}>{fieldErrors.gstin}</small>}
            </div>
          </fieldset>

          <fieldset className={styles.actionFieldset}>
            <legend>Workshop address</legend>
            <div className={styles.actionFieldGrid}>
              <label className={styles.actionFullField}><span>Address line 1</span><input defaultValue={application.addressLine1} maxLength={160} minLength={5} name="addressLine1" required /></label>
              <label className={styles.actionFullField}><span>Address line 2 <small>Optional</small></span><input defaultValue={application.addressLine2} maxLength={160} name="addressLine2" /></label>
              <label><span>City</span><input defaultValue={application.city} maxLength={80} minLength={2} name="city" required /></label>
              <label><span>State</span><input defaultValue={application.state} maxLength={80} minLength={2} name="state" required /></label>
              <label><span>Workshop PIN code</span><input defaultValue={application.postalCode} inputMode="numeric" name="postalCode" pattern="[1-9][0-9]{5}" required /></label>
            </div>
          </fieldset>

          <fieldset className={styles.actionFieldset}>
            <legend>Service area and capabilities</legend>
            <div className={styles.actionFieldGrid}>
              <label className={styles.actionFullField}>
                <span>PIN codes served</span>
                <textarea aria-invalid={Boolean(fieldErrors.servicePostalCodes)} defaultValue={application.servicePostalCodes.join(", ")} name="servicePostalCodes" rows={2} required />
                <small>Separate PIN codes with commas or spaces. The workshop PIN is included automatically.</small>
                {fieldErrors.servicePostalCodes && <em>{fieldErrors.servicePostalCodes}</em>}
              </label>
              <div className={styles.actionFullField}>
                <span className={styles.actionGroupLabel}>Service categories</span>
                <div className={styles.actionCheckboxGrid}>
                  {categories.map((category) => (
                    <label key={category.id} title={category.description}>
                      <input checked={selectedCategories.includes(category.id)} onChange={() => toggleCategory(category.id)} type="checkbox" />
                      <span>{category.name}</span>
                    </label>
                  ))}
                </div>
                {fieldErrors.serviceCategoryIds && <em className={styles.actionInlineError}>{fieldErrors.serviceCategoryIds}</em>}
              </div>
              <label className={styles.actionFullField}>
                <span>Printing services</span>
                <textarea aria-invalid={Boolean(fieldErrors.printingServices)} defaultValue={application.printingServices.join(", ")} name="printingServices" rows={3} required />
                <small>Separate services with commas or new lines.</small>
                {fieldErrors.printingServices && <em>{fieldErrors.printingServices}</em>}
              </label>
              <label className={styles.actionFullField}>
                <span>Equipment</span>
                <textarea aria-invalid={Boolean(fieldErrors.equipment)} defaultValue={application.equipment.join(", ")} name="equipment" rows={3} required />
                <small>Separate equipment with commas or new lines.</small>
                {fieldErrors.equipment && <em>{fieldErrors.equipment}</em>}
              </label>
            </div>
          </fieldset>

          <div className={styles.actionSubmitRow}>
            <p>Review every correction before resubmitting. Your email and verified mobile cannot be changed here.</p>
            <button disabled={submitting} type="submit">
              {submitting ? <LoaderCircle aria-hidden="true" className={styles.spinning} size={17} /> : <Send aria-hidden="true" size={16} />}
              {submitting ? "Submitting…" : "Resubmit for review"}
            </button>
          </div>
        </form>

        <form className={styles.documentUploadForm} onSubmit={uploadDocument}>
          <div className={styles.uploadIcon}><FileUp aria-hidden="true" size={22} /></div>
          <span className={styles.uploadEyebrow}>Supporting evidence</span>
          <h3>Upload a requested document</h3>
          <p>Add the document before resubmitting if it was requested in the review note. It appears in the document list as soon as the upload succeeds.</p>
          {statusBlock(uploadStatus, uploadStatusRef)}
          <label><span>Document type</span><select defaultValue="BUSINESS_REGISTRATION" name="documentType">{documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>File</span><input accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" name="document" ref={fileInputRef} required type="file" /><small>PDF, PNG or JPEG · maximum 4 MB</small></label>
          <button disabled={uploading} type="submit">
            {uploading ? <LoaderCircle aria-hidden="true" className={styles.spinning} size={17} /> : <FileUp aria-hidden="true" size={16} />}
            {uploading ? "Uploading…" : "Upload document"}
          </button>
        </form>
      </div>
    </section>
  );
}
