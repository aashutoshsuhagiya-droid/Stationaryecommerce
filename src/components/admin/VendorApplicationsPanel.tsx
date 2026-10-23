"use client";

import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";

import { Card, PageHeader, StatusBadge } from "./AdminUI";
import styles from "./admin.module.css";

type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACTION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

type ReviewAction = "START_REVIEW" | "REQUEST_CHANGES" | "APPROVE" | "REJECT" | "SUSPEND" | "REACTIVATE";
type DocumentReviewStatus = "APPROVED" | "REJECTED";
type BadgeTone = "success" | "info" | "warning" | "violet" | "danger" | "muted";

interface PersonSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface VendorDocument {
  id: string;
  type: string;
  reviewStatus: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface VendorApplicationEvent {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  action: string;
  applicantMessage: string | null;
  internalNotes?: string | null;
  createdAt: string;
  actor?: PersonSummary | null;
}

interface VendorApplication {
  id: string;
  status: ApplicationStatus;
  version: number;
  ownerName: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  servicePostalCodes: string[];
  serviceCategoryIds: string[];
  printingServices: string[];
  equipment: string[];
  businessRegistrationNumber: string | null;
  gstin: string | null;
  submittedAt: string | null;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
  applicantMessage: string | null;
  internalReviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  documents: VendorDocument[];
  events: VendorApplicationEvent[];
  reviewer?: PersonSummary | null;
  profile: {
    id: string;
    operationalStatus: "INACTIVE" | "ACTIVE" | "SUSPENDED" | "CLOSED";
    availabilityStatus: string;
    acceptingOrders: boolean;
    approvedAt: string | null;
  } | null;
}

interface ApiPayload<T> {
  data?: T;
  error?: { message?: string };
}

const statuses: Array<{ value: "ALL" | ApplicationStatus; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "ACTION_REQUIRED", label: "Action required" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DRAFT", label: "Draft" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

const actionLabels: Record<ReviewAction, string> = {
  START_REVIEW: "Start review",
  REQUEST_CHANGES: "Request changes",
  APPROVE: "Approve",
  REJECT: "Reject",
  SUSPEND: "Suspend",
  REACTIVATE: "Reactivate",
};

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function statusTone(status: ApplicationStatus): BadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "SUBMITTED") return "info";
  if (status === "UNDER_REVIEW") return "violet";
  if (status === "ACTION_REQUIRED") return "warning";
  if (status === "REJECTED") return "danger";
  return "muted";
}

function documentTone(status: string): BadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "NEEDS_REPLACEMENT") return "warning";
  return "muted";
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-IN", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function personName(person: PersonSummary | null | undefined) {
  if (!person) return "Unassigned";
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

function availableActions(application: VendorApplication): ReviewAction[] {
  if (application.status === "SUBMITTED") return ["START_REVIEW", "APPROVE", "REQUEST_CHANGES", "REJECT"];
  if (application.status === "UNDER_REVIEW") return ["APPROVE", "REQUEST_CHANGES", "REJECT"];
  if (application.status === "APPROVED" && application.profile?.operationalStatus === "ACTIVE") return ["SUSPEND"];
  if (application.status === "APPROVED" && application.profile?.operationalStatus === "SUSPENDED") return ["REACTIVATE"];
  return [];
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return fallback;
  const error = (payload as ApiPayload<unknown>).error;
  return typeof error?.message === "string" && error.message ? error.message : fallback;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function VendorApplicationsPanel() {
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ApplicationStatus>("ALL");
  const [selected, setSelected] = useState<VendorApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingDocumentId, setReviewingDocumentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadApplications = useCallback(async (options?: { signal?: AbortSignal; quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/admin/vendor-applications", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: options?.signal,
      });
      const payload = await parseJson(response) as ApiPayload<VendorApplication[]> | null;
      if (!response.ok) throw new Error(getErrorMessage(payload, "Vendor applications could not be loaded."));
      if (!Array.isArray(payload?.data)) throw new Error("The vendor application response was not valid.");
      setApplications(payload.data);
      return payload.data;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      const message = error instanceof Error ? error.message : "Vendor applications could not be loaded.";
      setLoadError(message);
      return null;
    } finally {
      if (quiet) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadApplications({ signal: controller.signal });
    return () => controller.abort();
  }, [loadApplications]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesStatus = status === "ALL" || application.status === status;
      const searchable = [
        application.businessName,
        application.ownerName,
        application.businessEmail,
        application.businessPhone,
        application.city,
        application.state,
        application.postalCode,
        application.gstin ?? "",
        ...application.servicePostalCodes,
      ].join(" ").toLowerCase();
      return matchesStatus && (!needle || searchable.includes(needle));
    });
  }, [applications, query, status]);

  const summary = useMemo(() => ({
    total: applications.length,
    reviewQueue: applications.filter((application) => ["SUBMITTED", "UNDER_REVIEW"].includes(application.status)).length,
    actionRequired: applications.filter((application) => application.status === "ACTION_REQUIRED").length,
    approved: applications.filter((application) => application.status === "APPROVED").length,
  }), [applications]);

  function openApplication(application: VendorApplication) {
    setActionError(null);
    setDocumentError(null);
    setSuccessMessage(null);
    setSelected(application);
  }

  async function handleDocumentReview(input: { documentId: string; reviewStatus: DocumentReviewStatus; reviewNotes: string }) {
    if (!selected) return;
    if (input.reviewStatus === "REJECTED" && !input.reviewNotes.trim()) {
      setDocumentError("Add a review note explaining why the document is being rejected.");
      return;
    }
    const applicationAtSubmit = selected;
    const documentAtSubmit = applicationAtSubmit.documents.find((document) => document.id === input.documentId);
    if (!documentAtSubmit) return;

    setReviewingDocumentId(input.documentId);
    setDocumentError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/vendor-documents/${encodeURIComponent(input.documentId)}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: input.reviewStatus,
          ...(input.reviewNotes.trim() ? { reviewNotes: input.reviewNotes.trim() } : {}),
        }),
      });
      const payload = await parseJson(response) as ApiPayload<Partial<VendorDocument>> | null;
      if (!response.ok) throw new Error(getErrorMessage(payload, "The document review could not be saved."));
      if (!payload?.data) throw new Error("The document review response was not valid.");

      const updatedDocument = {
        ...documentAtSubmit,
        ...payload.data,
        reviewStatus: input.reviewStatus,
        reviewNotes: input.reviewNotes.trim() || payload.data.reviewNotes || null,
      };
      const updatedApplication = {
        ...applicationAtSubmit,
        documents: applicationAtSubmit.documents.map((document) => document.id === updatedDocument.id ? updatedDocument : document),
      };
      setApplications((current) => current.map((application) => application.id === updatedApplication.id ? updatedApplication : application));
      setSelected(updatedApplication);
      setSuccessMessage(`${documentAtSubmit.originalName} marked ${humanize(input.reviewStatus).toLowerCase()}.`);

      const latest = await loadApplications({ quiet: true });
      const refreshed = latest?.find((application) => application.id === updatedApplication.id);
      if (refreshed) setSelected(refreshed);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "The document review could not be saved.");
    } finally {
      setReviewingDocumentId(null);
    }
  }

  async function handleDecision(input: { action: ReviewAction; applicantMessage: string; internalNotes: string }) {
    if (!selected) return;
    const applicationAtSubmit = selected;
    setSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/vendor-applications/${encodeURIComponent(applicationAtSubmit.id)}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: input.action,
          expectedVersion: applicationAtSubmit.version,
          ...(input.applicantMessage.trim() ? { applicantMessage: input.applicantMessage.trim() } : {}),
          ...(input.internalNotes.trim() ? { internalNotes: input.internalNotes.trim() } : {}),
        }),
      });
      const payload = await parseJson(response) as ApiPayload<Partial<VendorApplication>> | null;
      if (!response.ok) throw new Error(getErrorMessage(payload, "The review action could not be completed."));
      if (!payload?.data) throw new Error("The review response was not valid.");

      const updated = {
        ...applicationAtSubmit,
        ...payload.data,
        internalReviewNotes: input.internalNotes.trim() || applicationAtSubmit.internalReviewNotes,
      } as VendorApplication;
      setApplications((current) => current.map((application) => application.id === updated.id ? updated : application));
      setSelected(updated);
      setSuccessMessage(`${actionLabels[input.action]} completed for ${updated.businessName}.`);

      const latest = await loadApplications({ quiet: true });
      const refreshed = latest?.find((application) => application.id === updated.id);
      if (refreshed) setSelected(refreshed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The review action could not be completed.";
      setActionError(message);
      if (message.toLowerCase().includes("changed") || message.toLowerCase().includes("refresh")) {
        const latest = await loadApplications({ quiet: true });
        const refreshed = latest?.find((application) => application.id === applicationAtSubmit.id);
        if (refreshed) setSelected(refreshed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        actions={
          <button
            className={styles.buttonSecondary}
            disabled={loading || refreshing}
            onClick={() => void loadApplications({ quiet: applications.length > 0 })}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={refreshing ? styles.spin : ""} size={14} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        }
        description="Review business details and documents, leave an auditable decision, and manage approved vendor access."
        eyebrow="Marketplace operations"
        title="Vendor applications"
      />

      {successMessage && !selected && (
        <div className={`${styles.vendorNotice} ${styles.vendorNoticeSuccess}`} role="status">
          <CheckCircle2 aria-hidden="true" size={17} />
          <span>{successMessage}</span>
          <button aria-label="Dismiss confirmation" onClick={() => setSuccessMessage(null)} type="button"><X size={14} /></button>
        </div>
      )}

      {loadError && applications.length > 0 && (
        <div className={`${styles.vendorNotice} ${styles.vendorNoticeError}`} role="alert">
          <AlertCircle aria-hidden="true" size={17} />
          <span>{loadError}</span>
          <button onClick={() => void loadApplications({ quiet: true })} type="button">Try again</button>
        </div>
      )}

      <Card>
        <div aria-label="Vendor application summary" className={styles.vendorSummary}>
          <div className={styles.vendorSummaryItem}><span className={styles.vendorSummaryIcon}><Building2 size={16} /></span><span><strong>{summary.total}</strong><small>Total applications</small></span></div>
          <div className={styles.vendorSummaryItem}><span className={styles.vendorSummaryIcon}><Clock3 size={16} /></span><span><strong>{summary.reviewQueue}</strong><small>In review queue</small></span></div>
          <div className={styles.vendorSummaryItem}><span className={styles.vendorSummaryIcon}><AlertCircle size={16} /></span><span><strong>{summary.actionRequired}</strong><small>Awaiting applicant</small></span></div>
          <div className={styles.vendorSummaryItem}><span className={styles.vendorSummaryIcon}><UserRoundCheck size={16} /></span><span><strong>{summary.approved}</strong><small>Approved vendors</small></span></div>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.localSearch}>
            <span className={styles.srOnly}>Search vendor applications</span>
            <Search aria-hidden="true" size={14} />
            <input
              className={styles.input}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search business, owner, email or city"
              type="search"
              value={query}
            />
          </label>
          <select
            aria-label="Application status"
            className={styles.select}
            onChange={(event) => setStatus(event.target.value as "ALL" | ApplicationStatus)}
            value={status}
          >
            {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <span aria-live="polite" className={styles.resultCount}>{filtered.length} {filtered.length === 1 ? "application" : "applications"} shown</span>
        </div>

        {loading ? (
          <div aria-busy="true" className={styles.vendorState} role="status">
            <LoaderCircle aria-hidden="true" className={styles.spin} size={25} />
            <h2>Loading vendor applications</h2>
            <p>Fetching the latest review queue and document status.</p>
          </div>
        ) : loadError && applications.length === 0 ? (
          <div className={styles.vendorState} role="alert">
            <span className={`${styles.vendorStateIcon} ${styles.vendorStateIconError}`}><AlertCircle size={23} /></span>
            <h2>Applications could not be loaded</h2>
            <p>{loadError}</p>
            <button className={styles.buttonSecondary} onClick={() => void loadApplications()} type="button"><RefreshCw size={14} /> Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.vendorState}>
            <span className={styles.vendorStateIcon}><Store size={23} /></span>
            <h2>{applications.length === 0 ? "No vendor applications yet" : "No applications match these filters"}</h2>
            <p>{applications.length === 0 ? "Submitted applications will appear here for review." : "Try another search term or application status."}</p>
            {applications.length > 0 && <button className={styles.buttonSecondary} onClick={() => { setQuery(""); setStatus("ALL"); }} type="button">Clear filters</button>}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Business</th><th>Contact</th><th>Location</th><th>Submitted</th><th>Status</th><th>Documents</th><th>Reviewer</th><th><span className={styles.srOnly}>Actions</span></th></tr>
              </thead>
              <tbody>
                {filtered.map((application, index) => (
                  <tr key={application.id}>
                    <td>
                      <button className={styles.vendorNameButton} onClick={() => openApplication(application)} type="button">
                        <span className={styles.avatar} data-color={["blue", "amber", "violet", "rose"][index % 4]}>{initials(application.businessName)}</span>
                        <span className={styles.cellStack}><strong>{application.businessName}</strong><span>{application.ownerName}</span></span>
                      </button>
                    </td>
                    <td><span className={styles.cellStack}><strong>{application.businessPhone}</strong><span>{application.businessEmail}</span></span></td>
                    <td><span className={styles.cellStack}><strong>{application.city}, {application.state}</strong><span>PIN {application.postalCode}</span></span></td>
                    <td>{formatDate(application.submittedAt ?? application.createdAt)}</td>
                    <td>
                      <span className={styles.vendorStatusStack}>
                        <StatusBadge tone={statusTone(application.status)}>{humanize(application.status)}</StatusBadge>
                        {application.profile?.operationalStatus === "SUSPENDED" && <span className={styles.vendorSuspended}>Vendor suspended</span>}
                      </span>
                    </td>
                    <td><span className={styles.vendorDocumentCount}><FileText size={13} /> {application.documents.length}</span></td>
                    <td>{personName(application.reviewer)}</td>
                    <td><button aria-label={`Review ${application.businessName}`} className={styles.buttonGhost} onClick={() => openApplication(application)} type="button">Review <ChevronRight size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <VendorApplicationDrawer
          actionError={actionError}
          application={selected}
          documentError={documentError}
          onClose={() => setSelected(null)}
          onDecision={handleDecision}
          onDocumentReview={handleDocumentReview}
          reviewingDocumentId={reviewingDocumentId}
          submitting={submitting}
          successMessage={successMessage}
        />
      )}
    </>
  );
}

function VendorApplicationDrawer({
  application,
  actionError,
  documentError,
  successMessage,
  submitting,
  reviewingDocumentId,
  onClose,
  onDecision,
  onDocumentReview,
}: {
  application: VendorApplication;
  actionError: string | null;
  documentError: string | null;
  successMessage: string | null;
  submitting: boolean;
  reviewingDocumentId: string | null;
  onClose: () => void;
  onDecision: (input: { action: ReviewAction; applicantMessage: string; internalNotes: string }) => Promise<void>;
  onDocumentReview: (input: { documentId: string; reviewStatus: DocumentReviewStatus; reviewNotes: string }) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actions = availableActions(application);
  const [action, setAction] = useState<ReviewAction | null>(actions[0] ?? null);
  const [applicantMessage, setApplicantMessage] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const publicMessageRequired = action === "REQUEST_CHANGES" || action === "REJECT";
  const busy = submitting || reviewingDocumentId !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog?.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
    };
  }, []);

  useEffect(() => {
    setAction((current) => current && actions.includes(current) ? current : actions[0] ?? null);
    setApplicantMessage("");
    setInternalNotes("");
  }, [application.version]); // A new version means the available transition and note draft may have changed.

  function handleBackdropPointer(event: PointerEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside && !busy) onClose();
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || (publicMessageRequired && !applicantMessage.trim())) return;
    await onDecision({ action, applicantMessage, internalNotes });
  }

  return (
    <dialog
      aria-describedby="vendor-application-description"
      aria-labelledby="vendor-application-title"
      className={styles.vendorDialog}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onPointerDown={handleBackdropPointer}
      ref={dialogRef}
    >
      <div className={styles.vendorDialogHeader}>
        <div>
          <p>Vendor application</p>
          <h2 id="vendor-application-title">{application.businessName}</h2>
          <span id="vendor-application-description">Submitted by {application.ownerName} · version {application.version}</span>
        </div>
        <button aria-label="Close application details" className={styles.iconButton} disabled={busy} onClick={onClose} type="button"><X size={17} /></button>
      </div>

      <div className={styles.vendorDialogBody}>
        <div className={styles.vendorDetailHero}>
          <span className={styles.vendorHeroAvatar}>{initials(application.businessName)}</span>
          <div>
            <strong>{application.businessName}</strong>
            <span>{application.ownerName}</span>
          </div>
          <div className={styles.vendorHeroStatus}>
            <StatusBadge tone={statusTone(application.status)}>{humanize(application.status)}</StatusBadge>
            {application.profile && <span>{humanize(application.profile.operationalStatus)}</span>}
          </div>
        </div>

        {successMessage && (
          <div className={`${styles.vendorNotice} ${styles.vendorNoticeSuccess}`} role="status">
            <CheckCircle2 aria-hidden="true" size={17} /><span>{successMessage}</span>
          </div>
        )}
        {actionError && (
          <div className={`${styles.vendorNotice} ${styles.vendorNoticeError}`} role="alert">
            <AlertCircle aria-hidden="true" size={17} /><span>{actionError}</span>
          </div>
        )}
        {documentError && (
          <div className={`${styles.vendorNotice} ${styles.vendorNoticeError}`} role="alert">
            <AlertCircle aria-hidden="true" size={17} /><span>{documentError}</span>
          </div>
        )}

        <section className={styles.vendorDetailSection}>
          <h3>Business details</h3>
          <div className={styles.vendorDetailGrid}>
            <div><span>Owner</span><strong>{application.ownerName}</strong></div>
            <div><span>Mobile</span><a href={`tel:${application.businessPhone}`}>{application.businessPhone}</a></div>
            <div><span>Email</span><a href={`mailto:${application.businessEmail}`}>{application.businessEmail}</a></div>
            <div><span>Submitted</span><strong>{formatDate(application.submittedAt ?? application.createdAt, true)}</strong></div>
            <div className={styles.vendorDetailWide}><span>Address</span><strong>{[application.addressLine1, application.addressLine2, application.city, application.state, application.postalCode].filter(Boolean).join(", ")}</strong></div>
            <div><span>GSTIN</span><strong>{application.gstin || "Not provided"}</strong></div>
            <div><span>Registration no.</span><strong>{application.businessRegistrationNumber || "Not provided"}</strong></div>
            <div><span>Reviewer</span><strong>{personName(application.reviewer)}</strong></div>
            <div><span>Review started</span><strong>{formatDate(application.reviewStartedAt, true)}</strong></div>
            <div><span>Decision recorded</span><strong>{formatDate(application.reviewedAt, true)}</strong></div>
            <div><span>Last updated</span><strong>{formatDate(application.updatedAt, true)}</strong></div>
          </div>
        </section>

        <section className={styles.vendorDetailSection}>
          <h3><MapPin aria-hidden="true" size={14} /> Services & coverage</h3>
          <div className={styles.vendorLabelGroup}>
            <span>Printing services</span>
            <div className={styles.vendorTagList}>{application.printingServices.map((service) => <span key={service}>{service}</span>)}</div>
          </div>
          <div className={styles.vendorLabelGroup}>
            <span>Equipment</span>
            <div className={styles.vendorTagList}>{application.equipment.map((item) => <span key={item}>{item}</span>)}</div>
          </div>
          <div className={styles.vendorLabelGroup}>
            <span>Service PIN codes</span>
            <div className={styles.vendorTagList}>{application.servicePostalCodes.map((postalCode) => <span key={postalCode}>{postalCode}</span>)}</div>
          </div>
          <div className={styles.vendorLabelGroup}>
            <span>Category IDs</span>
            <div className={styles.vendorTagList}>{application.serviceCategoryIds.map((category) => <span key={category}>{category}</span>)}</div>
          </div>
        </section>

        <section className={styles.vendorDetailSection}>
          <h3><ShieldCheck aria-hidden="true" size={14} /> Verification documents</h3>
          {application.documents.length === 0 ? (
            <p className={styles.vendorMutedCopy}>No verification documents were uploaded with this application.</p>
          ) : (
            <ul className={styles.vendorDocumentList}>
              {application.documents.map((document) => (
                <li key={document.id}>
                  <span className={styles.vendorFileIcon}><FileText size={16} /></span>
                  <div className={styles.vendorDocumentMeta}>
                    <strong>{document.originalName}</strong>
                    <span>{humanize(document.type)} · {formatBytes(document.sizeBytes)}</span>
                    {document.reviewNotes && <small>{document.reviewNotes}</small>}
                  </div>
                  <StatusBadge tone={documentTone(document.reviewStatus)}>{humanize(document.reviewStatus)}</StatusBadge>
                  <a aria-label={`Download ${document.originalName}`} className={styles.vendorDownloadLink} href={`/api/admin/vendor-documents/${encodeURIComponent(document.id)}`}>
                    <Download aria-hidden="true" size={14} /> Download
                  </a>
                  <div className={styles.vendorDocumentReview}>
                    <label>
                      <span className={styles.srOnly}>Review notes for {document.originalName}; required when rejecting</span>
                      <input
                        className={styles.input}
                        disabled={reviewingDocumentId === document.id}
                        maxLength={500}
                        onChange={(event) => setDocumentNotes((current) => ({ ...current, [document.id]: event.target.value }))}
                        placeholder="Review note (required to reject)"
                        value={documentNotes[document.id] ?? ""}
                      />
                    </label>
                    <div>
                      <button
                        className={styles.buttonSecondary}
                        disabled={reviewingDocumentId !== null}
                        onClick={() => void onDocumentReview({ documentId: document.id, reviewStatus: "APPROVED", reviewNotes: documentNotes[document.id] ?? "" })}
                        type="button"
                      >
                        {reviewingDocumentId === document.id ? <LoaderCircle className={styles.spin} size={13} /> : <CheckCircle2 size={13} />} Approve
                      </button>
                      <button
                        className={styles.buttonDanger}
                        disabled={reviewingDocumentId !== null || !(documentNotes[document.id] ?? "").trim()}
                        onClick={() => void onDocumentReview({ documentId: document.id, reviewStatus: "REJECTED", reviewNotes: documentNotes[document.id] ?? "" })}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.vendorDetailSection}>
          <h3>Review notes & decision</h3>
          {(application.applicantMessage || application.internalReviewNotes) && (
            <div className={styles.vendorCurrentNotes}>
              {application.applicantMessage && <div><span>Latest applicant-facing note</span><p>{application.applicantMessage}</p></div>}
              {application.internalReviewNotes && <div><span>Latest internal note</span><p>{application.internalReviewNotes}</p></div>}
            </div>
          )}

          {actions.length === 0 ? (
            <div className={styles.vendorNoActions}>
              <CheckCircle2 aria-hidden="true" size={17} />
              <span>{application.status === "ACTION_REQUIRED" ? "Waiting for the applicant to update and resubmit this application." : "There are no review actions available for this application."}</span>
            </div>
          ) : (
            <form className={styles.vendorDecisionForm} onSubmit={submitDecision}>
              <fieldset disabled={submitting}>
                <legend>Choose an action</legend>
                <div className={styles.vendorActionChoices}>
                  {actions.map((option) => (
                    <label className={action === option ? styles.vendorActionSelected : ""} key={option}>
                      <input checked={action === option} name="review-action" onChange={() => setAction(option)} type="radio" value={option} />
                      <span>{actionLabels[option]}</span>
                    </label>
                  ))}
                </div>

                <label className={styles.vendorFormField}>
                  <span>Message to applicant {publicMessageRequired && <em>Required</em>}</span>
                  <textarea
                    className={styles.textarea}
                    maxLength={1000}
                    onChange={(event) => setApplicantMessage(event.target.value)}
                    placeholder={action === "REQUEST_CHANGES" ? "Explain what the applicant needs to update…" : action === "REJECT" ? "Explain why this application cannot be approved…" : "Optional note visible to the applicant…"}
                    required={publicMessageRequired}
                    value={applicantMessage}
                  />
                  <small>{applicantMessage.length}/1000</small>
                </label>

                <label className={styles.vendorFormField}>
                  <span>Internal notes <em>Staff only</em></span>
                  <textarea
                    className={styles.textarea}
                    maxLength={4000}
                    onChange={(event) => setInternalNotes(event.target.value)}
                    placeholder="Add context for the internal audit trail…"
                    value={internalNotes}
                  />
                  <small>{internalNotes.length}/4000</small>
                </label>

                <div className={styles.vendorDecisionFooter}>
                  <span>Submitting against version {application.version}</span>
                  <button
                    className={action === "REJECT" || action === "SUSPEND" ? styles.buttonDanger : styles.buttonPrimary}
                    disabled={!action || (publicMessageRequired && !applicantMessage.trim()) || submitting}
                    type="submit"
                  >
                    {submitting ? <><LoaderCircle aria-hidden="true" className={styles.spin} size={14} /> Saving…</> : <>Confirm {action ? actionLabels[action] : "action"}</>}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </section>

        <section className={styles.vendorDetailSection}>
          <h3>Application history</h3>
          {application.events.length === 0 ? (
            <p className={styles.vendorMutedCopy}>No review activity has been recorded yet.</p>
          ) : (
            <ol className={styles.vendorTimeline}>
              {application.events.map((event) => (
                <li key={event.id}>
                  <span className={styles.vendorTimelineDot} />
                  <div>
                    <strong>{humanize(event.action)}</strong>
                    <span>{personName(event.actor)} · {formatDate(event.createdAt, true)}</span>
                    <p>{event.fromStatus ? `${humanize(event.fromStatus)} → ` : ""}{humanize(event.toStatus)}</p>
                    {event.applicantMessage && <small>Applicant: {event.applicantMessage}</small>}
                    {event.internalNotes && <small>Internal: {event.internalNotes}</small>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </dialog>
  );
}
