"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FilePlus2,
  Info,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";

import styles from "./vendor-registration.module.css";

type CategoryOption = {
  id: string;
  name: string;
  description: string;
};

type DocumentType =
  | "BUSINESS_REGISTRATION"
  | "GST_CERTIFICATE"
  | "SHOP_LICENSE"
  | "IDENTITY_PROOF"
  | "ADDRESS_PROOF"
  | "OTHER";

type DocumentEntry = {
  id: number;
  type: DocumentType;
  file: File | null;
};

type OtpPhase = "idle" | "requesting" | "sent" | "verifying" | "verified";

type OtpState = {
  phase: OtpPhase;
  challengeId: string;
  verifiedMobile: string;
  expiresAt?: string;
  developmentCode?: string;
  message?: string;
  tone?: "success" | "error" | "neutral";
};

type ApiIssue = { path?: string; message?: string };
type ApiBody<T> = {
  data?: T;
  meta?: { redirectTo?: string };
  error?: { code?: string; message?: string; details?: ApiIssue[] };
};

type FormStatus = {
  tone: "error" | "success";
  title: string;
  message: string;
};

const serviceOptions = [
  "Digital printing",
  "Vinyl label printing",
  "UV printing",
  "Screen printing",
  "Sublimation printing",
  "Laser engraving",
] as const;

const equipmentOptions = [
  "Digital production press",
  "Wide-format printer",
  "Laminator",
  "Vinyl cutter / plotter",
  "Laser cutter / engraver",
  "Heat press",
] as const;

const documentTypeOptions: Array<{ value: DocumentType; label: string }> = [
  { value: "BUSINESS_REGISTRATION", label: "Business registration" },
  { value: "GST_CERTIFICATE", label: "GST certificate" },
  { value: "SHOP_LICENSE", label: "Shop licence" },
  { value: "IDENTITY_PROOF", label: "Identity proof" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "OTHER", label: "Other supporting document" },
];

const acceptedDocumentTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function normalizeMobile(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  if (compact.startsWith("+91")) return compact.slice(3);
  if (compact.length === 12 && compact.startsWith("91")) return compact.slice(2);
  return compact;
}

function uniqueList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function commaSeparated(value: string) {
  return uniqueList(value.split(/[,\n]+/));
}

function servicePostalCodes(value: string, shopPostalCode: string) {
  return uniqueList([shopPostalCode.trim(), ...value.split(/[\s,]+/)]);
}

function apiMessage<T>(body: ApiBody<T>, fallback: string) {
  return body.error?.message?.trim() || fallback;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span className={styles.fieldError} id={id}>{message}</span>;
}

export default function VendorRegistrationForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const documentId = useRef(1);
  const [mobile, setMobile] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otp, setOtp] = useState<OtpState>({
    phase: "idle",
    challengeId: "",
    verifiedMobile: "",
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [gstStatus, setGstStatus] = useState("");
  const [documents, setDocuments] = useState<DocumentEntry[]>([
    { id: documentId.current, type: "BUSINESS_REGISTRATION", file: null },
  ]);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function fieldError(key: string) {
    return fieldErrors[key];
  }

  function describedBy(key: string, hintId?: string) {
    return [hintId, fieldError(key) ? `${key.replaceAll(".", "-")}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  }

  function focusErrorSummary() {
    requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  function resetOtpForMobile(nextMobile: string) {
    setMobile(nextMobile);
    if (normalizeMobile(nextMobile) !== otp.verifiedMobile || otp.phase !== "verified") {
      setOtp({ phase: "idle", challengeId: "", verifiedMobile: "" });
      setOtpCode("");
    }
    setFieldErrors((current) => {
      const next = { ...current };
      delete next["application.mobile"];
      delete next.otpChallengeId;
      return next;
    });
  }

  async function requestOtp() {
    const normalized = normalizeMobile(mobile);
    if (!/^[6-9][0-9]{9}$/.test(normalized)) {
      setOtp({
        phase: "idle",
        challengeId: "",
        verifiedMobile: "",
        message: "Enter a valid 10-digit Indian mobile number.",
        tone: "error",
      });
      return;
    }

    setOtp((current) => ({ ...current, phase: "requesting", message: undefined }));
    try {
      const response = await fetch("/api/vendor/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: normalized }),
      });
      const body = await response.json().catch(() => ({})) as ApiBody<{
        challengeId: string;
        expiresAt: string;
        developmentCode?: string;
      }>;
      if (!response.ok || !body.data?.challengeId) {
        throw new Error(apiMessage(body, "We could not send a verification code. Please try again."));
      }
      setOtpCode("");
      setOtp({
        phase: "sent",
        challengeId: body.data.challengeId,
        verifiedMobile: normalized,
        expiresAt: body.data.expiresAt,
        developmentCode: body.data.developmentCode,
        message: `A 6-digit code was sent to +91 ${normalized}.`,
        tone: "success",
      });
      requestAnimationFrame(() => otpInputRef.current?.focus());
    } catch (error) {
      setOtp({
        phase: "idle",
        challengeId: "",
        verifiedMobile: "",
        message: error instanceof Error ? error.message : "We could not send a verification code.",
        tone: "error",
      });
    }
  }

  async function verifyOtp() {
    if (!otp.challengeId || !/^\d{6}$/.test(otpCode.trim())) {
      setOtp((current) => ({
        ...current,
        phase: "sent",
        message: "Enter the 6-digit code sent to your mobile.",
        tone: "error",
      }));
      return;
    }

    setOtp((current) => ({ ...current, phase: "verifying", message: undefined }));
    try {
      const response = await fetch("/api/vendor/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: otp.challengeId,
          mobile: otp.verifiedMobile,
          code: otpCode.trim(),
        }),
      });
      const body = await response.json().catch(() => ({})) as ApiBody<{ verified: boolean }>;
      if (!response.ok || !body.data?.verified) {
        throw new Error(apiMessage(body, "The verification code could not be confirmed."));
      }
      setOtp((current) => ({
        ...current,
        phase: "verified",
        message: "Mobile number verified.",
        tone: "success",
      }));
      requestAnimationFrame(() => mobileInputRef.current?.focus());
      setFieldErrors((current) => {
        const next = { ...current };
        delete next["application.mobile"];
        delete next.otpChallengeId;
        return next;
      });
    } catch (error) {
      setOtp((current) => ({
        ...current,
        phase: "sent",
        message: error instanceof Error ? error.message : "The verification code could not be confirmed.",
        tone: "error",
      }));
    }
  }

  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function toggleValue(value: string, values: string[], update: (next: string[]) => void, errorKey: string) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
    clearFieldError(errorKey);
  }

  function updateDocument(id: number, update: Partial<DocumentEntry>) {
    setDocuments((current) => current.map((document) => document.id === id ? { ...document, ...update } : document));
    clearFieldError("documentTypes");
  }

  function addDocument() {
    if (documents.length >= 5) return;
    documentId.current += 1;
    setDocuments((current) => [...current, {
      id: documentId.current,
      type: "OTHER",
      file: null,
    }]);
  }

  function removeDocument(id: number) {
    setDocuments((current) => {
      if (current.length > 1) return current.filter((document) => document.id !== id);
      documentId.current += 1;
      return [{ id: documentId.current, type: "BUSINESS_REGISTRATION", file: null }];
    });
  }

  function applyApiErrors(details: ApiIssue[] | undefined) {
    if (!Array.isArray(details)) return;
    const next: Record<string, string> = {};
    for (const issue of details) {
      if (!issue.path || !issue.message) continue;
      const issuePath = issue.path;
      const path = [
        "application.servicePostalCodes",
        "application.serviceCategoryIds",
        "application.printingServices",
        "application.equipment",
        "documentTypes",
      ].find((parent) => issuePath === parent || issuePath.startsWith(`${parent}.`)) ?? issuePath;
      if (!next[path]) next[path] = issue.message;
    }
    setFieldErrors(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    setStatus(null);
    setFieldErrors({});

    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus({
        tone: "error",
        title: "Complete the highlighted fields",
        message: "Some required information is missing or does not match the requested format.",
      });
      return;
    }

    const values = new FormData(form);
    const value = (name: string) => String(values.get(name) ?? "").trim();
    const normalized = normalizeMobile(mobile);
    const otherServices = commaSeparated(value("otherPrintingServices"));
    const otherEquipment = commaSeparated(value("otherEquipment"));
    const printingServices = uniqueList([...selectedServices, ...otherServices]);
    const equipment = uniqueList([...selectedEquipment, ...otherEquipment]);
    const shopPostalCode = value("postalCode");
    const servedPostalCodes = servicePostalCodes(value("servicePostalCodes"), shopPostalCode);
    const password = String(values.get("password") ?? "");
    const confirmPassword = String(values.get("confirmPassword") ?? "");
    const gstin = value("gstin").toUpperCase();
    const selectedDocuments = documents.filter((document): document is DocumentEntry & { file: File } => Boolean(document.file));
    const errors: Record<string, string> = {};
    const otpExpired = Boolean(otp.expiresAt && new Date(otp.expiresAt).getTime() <= Date.now());

    if (otp.phase !== "verified" || otp.verifiedMobile !== normalized || otpExpired) {
      errors.otpChallengeId = otpExpired
        ? "Your mobile verification expired. Send a new code."
        : "Verify this mobile number before submitting.";
      if (otpExpired) {
        setOtp({
          phase: "idle",
          challengeId: "",
          verifiedMobile: "",
          message: "Your mobile verification expired. Send a new code to continue.",
          tone: "error",
        });
        setOtpCode("");
      }
    }
    if (selectedCategories.length === 0) {
      errors["application.serviceCategoryIds"] = "Select at least one product category.";
    }
    if (printingServices.length === 0) {
      errors["application.printingServices"] = "Select or enter at least one printing service.";
    }
    if (equipment.length === 0) {
      errors["application.equipment"] = "Select or enter at least one piece of equipment.";
    }
    if (printingServices.length > 20 || printingServices.some((item) => item.length > 120)) {
      errors["application.printingServices"] = "Use no more than 20 services, with 120 characters per service.";
    }
    if (equipment.length > 20 || equipment.some((item) => item.length > 120)) {
      errors["application.equipment"] = "Use no more than 20 equipment entries, with 120 characters per entry.";
    }
    if (servedPostalCodes.length > 50 || servedPostalCodes.some((code) => !/^[1-9][0-9]{5}$/.test(code))) {
      errors["application.servicePostalCodes"] = "Enter up to 50 valid 6-digit PIN codes.";
    }
    if (gstStatus === "registered" && !gstinPattern.test(gstin)) {
      errors["application.gstin"] = "Enter a valid 15-character GSTIN.";
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    const invalidDocument = selectedDocuments.find(({ file }) =>
      !acceptedDocumentTypes.has(file.type) || file.size < 1 || file.size > 4 * 1024 * 1024,
    );
    if (invalidDocument) {
      errors.documentTypes = "Each document must be a PDF, PNG or JPEG file no larger than 4 MB.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus({
        tone: "error",
        title: "Review your application",
        message: "A few details still need your attention before the application can be submitted.",
      });
      focusErrorSummary();
      return;
    }

    const payload = {
      application: {
        ownerName: value("ownerName"),
        businessName: value("businessName"),
        email: value("email"),
        mobile: normalized,
        addressLine1: value("addressLine1"),
        ...(value("addressLine2") ? { addressLine2: value("addressLine2") } : {}),
        city: value("city"),
        state: value("state"),
        postalCode: shopPostalCode,
        servicePostalCodes: servedPostalCodes,
        serviceCategoryIds: selectedCategories,
        printingServices,
        equipment,
        ...(value("businessRegistrationNumber") ? {
          businessRegistrationNumber: value("businessRegistrationNumber"),
        } : {}),
        ...(gstStatus === "registered" ? { gstin } : {}),
        termsAccepted: values.get("termsAccepted") === "on",
      },
      password,
      confirmPassword,
      otpChallengeId: otp.challengeId,
      documentTypes: selectedDocuments.map((document) => document.type),
    };

    const submission = new FormData();
    submission.append("payload", JSON.stringify(payload));
    for (const document of selectedDocuments) submission.append("documents", document.file);

    setSubmitting(true);
    try {
      const response = await fetch("/api/vendor/register", {
        method: "POST",
        body: submission,
      });
      const body = await response.json().catch(() => ({})) as ApiBody<{ id: string }>;
      if (!response.ok || !body.data) {
        applyApiErrors(body.error?.details);
        if (body.error?.code === "PHONE_VERIFICATION_REQUIRED" || body.error?.code === "PHONE_VERIFICATION_USED") {
          setOtp({
            phase: "idle",
            challengeId: "",
            verifiedMobile: "",
            message: "Mobile verification is no longer valid. Send a new code to continue.",
            tone: "error",
          });
          setOtpCode("");
          setFieldErrors((current) => ({ ...current, otpChallengeId: "Verify this mobile number again." }));
        }
        throw new Error(apiMessage(body, "Your application could not be submitted. Please try again."));
      }
      setStatus({
        tone: "success",
        title: "Application submitted",
        message: "Your details are safely submitted. Opening your vendor application dashboard…",
      });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      router.replace(body.meta?.redirectTo || "/vendor");
    } catch (error) {
      setStatus({
        tone: "error",
        title: "Application not submitted",
        message: error instanceof Error ? error.message : "Please try again.",
      });
      focusErrorSummary();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.formCard}>
      <div className={styles.formHeading}>
        <p className={styles.eyebrow}>Partner application</p>
        <h2>Tell us about your business</h2>
        <p>Fields marked <span aria-hidden="true">*</span><span className={styles.srOnly}>with an asterisk</span> are required.</p>
      </div>

      {status && (
        <div
          className={`${styles.formStatus} ${status.tone === "error" ? styles.formStatusError : styles.formStatusSuccess}`}
          ref={errorSummaryRef}
          role={status.tone === "error" ? "alert" : "status"}
          tabIndex={-1}
        >
          {status.tone === "error" ? <Info aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <div><strong>{status.title}</strong><p>{status.message}</p></div>
        </div>
      )}

      <form
        className={styles.form}
        onSubmit={handleSubmit}
        onChange={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
          const name = target.name;
          if (!name) return;
          const directKey = ["password", "confirmPassword", "documentTypes", "otpChallengeId"].includes(name)
            ? name
            : name === "otherPrintingServices"
              ? "application.printingServices"
              : name === "otherEquipment"
                ? "application.equipment"
                : name === "termsAccepted"
                  ? "application.termsAccepted"
                  : `application.${name}`;
          clearFieldError(directKey);
        }}
        noValidate
      >
        <fieldset className={styles.section}>
          <legend><span>01</span><strong>Business contact</strong></legend>
          <p className={styles.sectionDescription}>Use the details of the person responsible for this application.</p>
          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label htmlFor="ownerName">Owner or contact name <span aria-hidden="true">*</span></label>
              <input id="ownerName" name="ownerName" autoComplete="name" minLength={2} maxLength={120} required aria-invalid={Boolean(fieldError("application.ownerName"))} aria-describedby={describedBy("application.ownerName")} />
              <FieldError id="application-ownerName-error" message={fieldError("application.ownerName")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="businessName">Business name <span aria-hidden="true">*</span></label>
              <input id="businessName" name="businessName" autoComplete="organization" minLength={2} maxLength={180} required aria-invalid={Boolean(fieldError("application.businessName"))} aria-describedby={describedBy("application.businessName")} />
              <FieldError id="application-businessName-error" message={fieldError("application.businessName")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="email">Business email <span aria-hidden="true">*</span></label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(fieldError("application.email"))} aria-describedby={describedBy("application.email")} />
              <FieldError id="application-email-error" message={fieldError("application.email")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="mobile">Mobile number <span aria-hidden="true">*</span></label>
              <div className={styles.mobileField}>
                <span aria-hidden="true">+91</span>
                <input ref={mobileInputRef} id="mobile" name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={mobile} onChange={(event) => resetOtpForMobile(event.target.value)} maxLength={18} required disabled={otp.phase === "requesting" || otp.phase === "verifying"} aria-invalid={Boolean(fieldError("application.mobile") || fieldError("otpChallengeId"))} aria-describedby={[otp.message ? "mobile-verification-status" : "", fieldError("application.mobile") || fieldError("otpChallengeId") ? "application-mobile-error" : ""].filter(Boolean).join(" ") || undefined} />
                <button type="button" onClick={requestOtp} disabled={otp.phase === "requesting" || otp.phase === "verifying" || otp.phase === "verified" || submitting}>
                  {otp.phase === "requesting" ? <><LoaderCircle className={styles.spin} aria-hidden="true" /> Sending…</> : otp.phase === "verified" ? <><Check aria-hidden="true" /> Verified</> : otp.phase === "sent" ? "Resend code" : "Send code"}
                </button>
              </div>
              <FieldError id="application-mobile-error" message={fieldError("application.mobile") || fieldError("otpChallengeId")} />
            </div>
          </div>

          {(otp.phase === "sent" || otp.phase === "verifying") && (
            <div className={styles.otpPanel}>
              <div className={styles.field}>
                <label htmlFor="otpCode">6-digit verification code</label>
                <input ref={otpInputRef} id="otpCode" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required aria-invalid={otp.tone === "error"} aria-describedby={otp.message ? "mobile-verification-status" : undefined} />
              </div>
              <button className={styles.secondaryButton} type="button" onClick={verifyOtp} disabled={otp.phase === "verifying" || submitting}>
                {otp.phase === "verifying" ? <><LoaderCircle className={styles.spin} aria-hidden="true" /> Checking…</> : "Verify mobile"}
              </button>
              {otp.developmentCode && <p className={styles.developmentCode}>Local development code: <code>{otp.developmentCode}</code></p>}
            </div>
          )}
          {otp.message && (
            <p id="mobile-verification-status" className={`${styles.inlineStatus} ${otp.tone === "error" ? styles.inlineStatusError : styles.inlineStatusSuccess}`} role={otp.tone === "error" ? "alert" : "status"}>
              {otp.tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}{otp.message}
            </p>
          )}
        </fieldset>

        <fieldset className={styles.section}>
          <legend><span>02</span><strong>Workshop address & service area</strong></legend>
          <p className={styles.sectionDescription}>This helps determine where production and fulfilment can take place.</p>
          <div className={styles.gridTwo}>
            <div className={`${styles.field} ${styles.fullWidth}`}>
              <label htmlFor="addressLine1">Address line 1 <span aria-hidden="true">*</span></label>
              <input id="addressLine1" name="addressLine1" autoComplete="address-line1" minLength={5} maxLength={160} required aria-invalid={Boolean(fieldError("application.addressLine1"))} aria-describedby={describedBy("application.addressLine1")} />
              <FieldError id="application-addressLine1-error" message={fieldError("application.addressLine1")} />
            </div>
            <div className={`${styles.field} ${styles.fullWidth}`}>
              <label htmlFor="addressLine2">Address line 2 <small>Optional</small></label>
              <input id="addressLine2" name="addressLine2" autoComplete="address-line2" maxLength={160} aria-invalid={Boolean(fieldError("application.addressLine2"))} aria-describedby={describedBy("application.addressLine2")} />
              <FieldError id="application-addressLine2-error" message={fieldError("application.addressLine2")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="city">City <span aria-hidden="true">*</span></label>
              <input id="city" name="city" autoComplete="address-level2" minLength={2} maxLength={80} required aria-invalid={Boolean(fieldError("application.city"))} aria-describedby={describedBy("application.city")} />
              <FieldError id="application-city-error" message={fieldError("application.city")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="state">State <span aria-hidden="true">*</span></label>
              <input id="state" name="state" autoComplete="address-level1" minLength={2} maxLength={80} required aria-invalid={Boolean(fieldError("application.state"))} aria-describedby={describedBy("application.state")} />
              <FieldError id="application-state-error" message={fieldError("application.state")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="postalCode">Workshop PIN code <span aria-hidden="true">*</span></label>
              <input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" pattern="[1-9][0-9]{5}" maxLength={6} required aria-invalid={Boolean(fieldError("application.postalCode"))} aria-describedby={describedBy("application.postalCode", "postal-code-hint")} />
              <small className={styles.hint} id="postal-code-hint">6-digit Indian PIN code.</small>
              <FieldError id="application-postalCode-error" message={fieldError("application.postalCode")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="servicePostalCodes">Other PIN codes served <small>Optional</small></label>
              <input id="servicePostalCodes" name="servicePostalCodes" placeholder="e.g. 411002, 411003" aria-invalid={Boolean(fieldError("application.servicePostalCodes"))} aria-describedby={describedBy("application.servicePostalCodes", "service-postal-hint")} />
              <small className={styles.hint} id="service-postal-hint">Separate PIN codes with commas. Your workshop PIN is included automatically.</small>
              <FieldError id="application-servicePostalCodes-error" message={fieldError("application.servicePostalCodes")} />
            </div>
          </div>
        </fieldset>

        <fieldset className={styles.section} aria-describedby="category-help application-serviceCategoryIds-error">
          <legend><span>03</span><strong>Product categories</strong></legend>
          <p className={styles.sectionDescription} id="category-help">Select every Naamly category your workshop can produce. Choose at least one.</p>
          <div className={styles.choiceGrid}>
            {categories.map((category) => {
              const selected = selectedCategories.includes(category.id);
              return (
                <label className={`${styles.choiceCard} ${selected ? styles.choiceCardSelected : ""}`} key={category.id}>
                  <input type="checkbox" name="serviceCategoryIds" value={category.id} checked={selected} onChange={() => toggleValue(category.id, selectedCategories, setSelectedCategories, "application.serviceCategoryIds")} />
                  <span className={styles.checkMark}><Check aria-hidden="true" /></span>
                  <span><strong>{category.name}</strong><small>{category.description}</small></span>
                </label>
              );
            })}
          </div>
          <FieldError id="application-serviceCategoryIds-error" message={fieldError("application.serviceCategoryIds")} />
        </fieldset>

        <fieldset className={styles.section}>
          <legend><span>04</span><strong>Production capabilities</strong></legend>
          <p className={styles.sectionDescription}>Choose the services and equipment currently available at your workshop.</p>
          <div className={styles.capabilityColumns}>
            <fieldset className={styles.capabilityGroup} aria-describedby="printing-services-help application-printingServices-error">
              <legend>Printing services <span aria-hidden="true">*</span></legend>
              <p id="printing-services-help">Select one or more.</p>
              <div className={styles.checkList}>
                {serviceOptions.map((option) => (
                  <label key={option}>
                    <input type="checkbox" checked={selectedServices.includes(option)} onChange={() => toggleValue(option, selectedServices, setSelectedServices, "application.printingServices")} />
                    <span><Check aria-hidden="true" /></span>{option}
                  </label>
                ))}
              </div>
              <div className={styles.field}>
                <label htmlFor="otherPrintingServices">Other services <small>Optional</small></label>
                <input id="otherPrintingServices" name="otherPrintingServices" placeholder="Separate multiple services with commas" maxLength={1000} />
              </div>
              <FieldError id="application-printingServices-error" message={fieldError("application.printingServices")} />
            </fieldset>
            <fieldset className={styles.capabilityGroup} aria-describedby="equipment-help application-equipment-error">
              <legend>Equipment <span aria-hidden="true">*</span></legend>
              <p id="equipment-help">Select one or more.</p>
              <div className={styles.checkList}>
                {equipmentOptions.map((option) => (
                  <label key={option}>
                    <input type="checkbox" checked={selectedEquipment.includes(option)} onChange={() => toggleValue(option, selectedEquipment, setSelectedEquipment, "application.equipment")} />
                    <span><Check aria-hidden="true" /></span>{option}
                  </label>
                ))}
              </div>
              <div className={styles.field}>
                <label htmlFor="otherEquipment">Other equipment <small>Optional</small></label>
                <input id="otherEquipment" name="otherEquipment" placeholder="Separate multiple items with commas" maxLength={1000} />
              </div>
              <FieldError id="application-equipment-error" message={fieldError("application.equipment")} />
            </fieldset>
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend><span>05</span><strong>Registration, GST & documents</strong></legend>
          <p className={styles.sectionDescription}>Supporting records help our team review your business accurately.</p>
          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label htmlFor="businessRegistrationNumber">Business registration number <small>Optional</small></label>
              <input id="businessRegistrationNumber" name="businessRegistrationNumber" maxLength={80} aria-invalid={Boolean(fieldError("application.businessRegistrationNumber"))} aria-describedby={describedBy("application.businessRegistrationNumber")} />
              <FieldError id="application-businessRegistrationNumber-error" message={fieldError("application.businessRegistrationNumber")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="gstStatus">GST registration <span aria-hidden="true">*</span></label>
              <select id="gstStatus" name="gstStatus" value={gstStatus} onChange={(event) => setGstStatus(event.target.value)} required>
                <option value="">Select one</option>
                <option value="registered">GST registered</option>
                <option value="not_registered">Not GST registered</option>
              </select>
            </div>
            {gstStatus === "registered" && (
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor="gstin">GSTIN <span aria-hidden="true">*</span></label>
                <input id="gstin" name="gstin" autoCapitalize="characters" maxLength={15} placeholder="22AAAAA0000A1Z5" required aria-invalid={Boolean(fieldError("application.gstin"))} aria-describedby={describedBy("application.gstin", "gstin-hint")} />
                <small className={styles.hint} id="gstin-hint">Enter the 15-character GST identification number.</small>
                <FieldError id="application-gstin-error" message={fieldError("application.gstin")} />
              </div>
            )}
          </div>

          <div className={styles.documentArea} aria-describedby="document-help documentTypes-error">
            <div className={styles.documentHeading}>
              <div><h3>Supporting documents</h3><p id="document-help">Optional at submission. Upload up to 5 PDF, PNG or JPEG files, 4 MB each.</p></div>
              <FilePlus2 aria-hidden="true" />
            </div>
            <div className={styles.documentList}>
              {documents.map((document, index) => (
                <div className={styles.documentRow} key={document.id}>
                  <span className={styles.documentNumber}>{index + 1}</span>
                  <div className={styles.field}>
                    <label htmlFor={`document-type-${document.id}`}>Document type</label>
                    <select id={`document-type-${document.id}`} value={document.type} onChange={(event) => updateDocument(document.id, { type: event.target.value as DocumentType })}>
                      {documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`document-file-${document.id}`}>Choose file</label>
                    <input id={`document-file-${document.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => updateDocument(document.id, { file: event.target.files?.[0] ?? null })} />
                  </div>
                  <button className={styles.removeDocument} type="button" onClick={() => removeDocument(document.id)} aria-label={`Remove document ${index + 1}`}><Trash2 aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            <FieldError id="documentTypes-error" message={fieldError("documentTypes")} />
            <button className={styles.addDocument} type="button" onClick={addDocument} disabled={documents.length >= 5}><Plus aria-hidden="true" /> Add another document</button>
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend><span>06</span><strong>Secure your account</strong></legend>
          <p className={styles.sectionDescription}>You will use this email and password to check the application status.</p>
          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label htmlFor="password">Password <span aria-hidden="true">*</span></label>
              <div className={styles.passwordField}>
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={200} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{12,}" required aria-invalid={Boolean(fieldError("password"))} aria-describedby={describedBy("password", "password-hint")} />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              </div>
              <small className={styles.hint} id="password-hint">At least 12 characters, including a letter and a number.</small>
              <FieldError id="password-error" message={fieldError("password")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="confirmPassword">Confirm password <span aria-hidden="true">*</span></label>
              <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={200} required aria-invalid={Boolean(fieldError("confirmPassword"))} aria-describedby={describedBy("confirmPassword")} />
              <FieldError id="confirmPassword-error" message={fieldError("confirmPassword")} />
            </div>
          </div>

          <label className={styles.termsRow}>
            <input type="checkbox" name="termsAccepted" required aria-invalid={Boolean(fieldError("application.termsAccepted"))} aria-describedby={fieldError("application.termsAccepted") ? "application-termsAccepted-error" : undefined} />
            <span>I confirm that the information provided is accurate and agree to Naamly&apos;s <Link href="/policies/terms">terms</Link> and <Link href="/policies/privacy">privacy policy</Link>. <span aria-hidden="true">*</span></span>
          </label>
          <FieldError id="application-termsAccepted-error" message={fieldError("application.termsAccepted")} />
        </fieldset>

        <div className={styles.submitArea}>
          <div><ShieldCheck aria-hidden="true" /><span><strong>Your information is submitted securely.</strong><small>Application approval is subject to review.</small></span></div>
          <button className={styles.submitButton} type="submit" disabled={submitting}>
            {submitting ? <><LoaderCircle className={styles.spin} aria-hidden="true" /> Submitting…</> : <>Submit application <ArrowRight aria-hidden="true" /></>}
          </button>
        </div>
      </form>

      <p className={styles.signInPrompt}>Already applied? <Link href="/login">Sign in to your account</Link></p>
    </div>
  );
}
