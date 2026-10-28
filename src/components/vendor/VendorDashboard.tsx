import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDot,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  Store,
  Wifi,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import type { getVendorApplicationForUser } from "@/lib/vendor-onboarding";

import { VendorActionRequiredForm } from "./VendorActionRequiredForm";
import { VendorLogoutButton } from "./VendorLogoutButton";
import { VendorOperationsWorkspace } from "./VendorOperationsWorkspace";
import styles from "./vendor.module.css";

type VendorApplication = NonNullable<Awaited<ReturnType<typeof getVendorApplicationForUser>>>;
type DashboardState = VendorApplication["status"] | "SUSPENDED";

interface StatusContent {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
}

const statusContent: Record<DashboardState, StatusContent> = {
  DRAFT: {
    label: "Draft",
    eyebrow: "Application in progress",
    title: "Your application has not been submitted",
    description: "Complete the required onboarding information before the review can begin.",
    icon: FileText,
    tone: "neutral",
  },
  SUBMITTED: {
    label: "Submitted",
    eyebrow: "Application received",
    title: "Your application is safely with us",
    description: "The partner review team has received your details and documents. We will post every change to this dashboard.",
    icon: FileCheck2,
    tone: "info",
  },
  UNDER_REVIEW: {
    label: "Under review",
    eyebrow: "Review in progress",
    title: "We are checking your business details",
    description: "The team is reviewing your service area, printing capabilities and supporting documents. No action is needed right now.",
    icon: Clock3,
    tone: "info",
  },
  ACTION_REQUIRED: {
    label: "Action required",
    eyebrow: "Your attention is needed",
    title: "The review team needs more information",
    description: "Read the latest update below for the exact correction or document requested before your application can move forward.",
    icon: AlertTriangle,
    tone: "warning",
  },
  APPROVED: {
    label: "Approved",
    eyebrow: "Partner approved",
    title: "Your printing partner account is approved",
    description: "Your operational state and live marketplace tools are shown below. Controls are available whenever your partner profile is active.",
    icon: ShieldCheck,
    tone: "success",
  },
  REJECTED: {
    label: "Rejected",
    eyebrow: "Review completed",
    title: "Your application was not approved",
    description: "Review the decision note below. Your submitted record and documents remain available here for reference.",
    icon: XCircle,
    tone: "danger",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    eyebrow: "Application closed",
    title: "This application has been withdrawn",
    description: "The application is no longer in review. Its history and submitted documents remain available for reference.",
    icon: XCircle,
    tone: "neutral",
  },
  SUSPENDED: {
    label: "Suspended",
    eyebrow: "Operations paused",
    title: "Your marketplace access is suspended",
    description: "Your approval remains on record, but new order availability is paused. Review the latest team update for details.",
    icon: AlertTriangle,
    tone: "danger",
  },
};

const documentLabels: Record<VendorApplication["documents"][number]["type"], string> = {
  BUSINESS_REGISTRATION: "Business registration",
  GST_CERTIFICATE: "GST certificate",
  SHOP_LICENSE: "Shop licence",
  IDENTITY_PROOF: "Identity proof",
  ADDRESS_PROOF: "Address proof",
  OTHER: "Supporting document",
};

const eventActionLabels: Record<string, string> = {
  APPLICATION_SUBMITTED: "Application submitted",
  APPLICATION_RESUBMITTED: "Application resubmitted",
  DOCUMENTS_UPLOADED: "Supporting documents uploaded",
  START_REVIEW: "Review started",
  REQUEST_CHANGES: "Additional information requested",
  APPROVE: "Application approved",
  REJECT: "Application rejected",
  SUSPEND: "Partner operations suspended",
  REACTIVATE: "Partner operations reactivated",
};

const statusLabels: Record<VendorApplication["status"], string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  ACTION_REQUIRED: "Action required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

function getDashboardState(application: VendorApplication): DashboardState {
  return application.profile?.operationalStatus === "SUSPENDED" ? "SUSPENDED" : application.status;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(value: Date | null) {
  return value ? dateFormatter.format(value) : "Not recorded";
}

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(tone: StatusContent["tone"]) {
  return {
    neutral: styles.toneNeutral,
    info: styles.toneInfo,
    warning: styles.toneWarning,
    success: styles.toneSuccess,
    danger: styles.toneDanger,
  }[tone];
}

function documentStatusClass(status: VendorApplication["documents"][number]["reviewStatus"]) {
  return {
    PENDING: styles.documentPending,
    APPROVED: styles.documentApproved,
    REJECTED: styles.documentRejected,
  }[status];
}

function readableDocumentStatus(status: VendorApplication["documents"][number]["reviewStatus"]) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function VendorDashboard({
  application,
  categories,
  email,
}: {
  application: VendorApplication;
  categories: Array<{ id: string; name: string; description: string }>;
  email: string;
}) {
  const state = getDashboardState(application);
  const status = statusContent[state];
  const StatusIcon = status.icon;
  const latestEvent = application.events[0];
  const latestMessage = application.applicantMessage
    ?? application.events.find((event) => event.applicantMessage)?.applicantMessage
    ?? status.description;
  const latestUpdateAt = latestEvent?.createdAt ?? application.updatedAt;
  const profile = application.profile;

  return (
    <div className={styles.vendorFrame}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>N</span>
          <span className={styles.brandCopy}>
            <strong>Naamly</strong>
            <span>Partner portal</span>
          </span>
        </Link>

        <nav aria-label="Partner dashboard" className={styles.navigation}>
          <a href="#overview"><LayoutDashboard aria-hidden="true" size={17} />Overview</a>
          {state === "ACTION_REQUIRED" && <a href="#requested-changes"><AlertTriangle aria-hidden="true" size={17} />Requested changes</a>}
          <a href="#application"><BriefcaseBusiness aria-hidden="true" size={17} />Application</a>
          {application.status === "APPROVED" && <a href="#operations"><Gauge aria-hidden="true" size={17} />Operations</a>}
          <a href="#documents"><FileText aria-hidden="true" size={17} />Documents</a>
          <a href="#activity"><Clock3 aria-hidden="true" size={17} />Status history</a>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.signedInAs}>
            <span>Signed in as</span>
            <strong title={email}>{email}</strong>
          </div>
          <VendorLogoutButton />
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span>Partner workspace</span>
            <strong>{application.businessName}</strong>
          </div>
          <div className={`${styles.statusPill} ${statusClass(status.tone)}`}>
            <span aria-hidden="true" />
            {status.label}
          </div>
        </header>

        <div className={styles.page}>
          <section className={`${styles.statusHero} ${statusClass(status.tone)}`} id="overview">
            <div className={styles.statusIcon}><StatusIcon aria-hidden="true" size={28} /></div>
            <div className={styles.statusCopy}>
              <p>{status.eyebrow}</p>
              <h1>{status.title}</h1>
              <span>{status.description}</span>
            </div>
            <dl className={styles.statusMeta}>
              <div><dt>Application</dt><dd>#{application.id.slice(-8).toUpperCase()}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDate(application.submittedAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{formatDate(application.updatedAt)}</dd></div>
            </dl>
          </section>

          {state === "ACTION_REQUIRED" && (
            <VendorActionRequiredForm
              application={{
                ownerName: application.ownerName,
                businessName: application.businessName,
                addressLine1: application.addressLine1,
                addressLine2: application.addressLine2 ?? "",
                city: application.city,
                state: application.state,
                postalCode: application.postalCode,
                servicePostalCodes: application.servicePostalCodes,
                serviceCategoryIds: application.serviceCategoryIds,
                printingServices: application.printingServices,
                equipment: application.equipment,
                businessRegistrationNumber: application.businessRegistrationNumber ?? "",
                gstin: application.gstin ?? "",
              }}
              categories={categories}
              requestMessage={latestMessage}
            />
          )}

          <div className={styles.dashboardGrid}>
            <section className={styles.panel} id="application">
              <div className={styles.panelHeading}>
                <div>
                  <p>Application</p>
                  <h2>Business details</h2>
                </div>
                <Store aria-hidden="true" size={20} />
              </div>
              <dl className={styles.detailGrid}>
                <div><dt>Business name</dt><dd>{application.businessName}</dd></div>
                <div><dt>Owner</dt><dd>{application.ownerName}</dd></div>
                <div><dt>Email</dt><dd>{application.businessEmail}</dd></div>
                <div><dt>Mobile</dt><dd>{application.businessPhone}</dd></div>
                <div className={styles.fullDetail}>
                  <dt>Business address</dt>
                  <dd>{[application.addressLine1, application.addressLine2, application.city, application.state, application.postalCode].filter(Boolean).join(", ")}</dd>
                </div>
                <div><dt>GSTIN</dt><dd>{application.gstin || "Not provided"}</dd></div>
                <div><dt>Registration number</dt><dd>{application.businessRegistrationNumber || "Not provided"}</dd></div>
              </dl>
              <div className={styles.capabilitySection}>
                <div>
                  <span><MapPin aria-hidden="true" size={15} />Service PIN codes</span>
                  <div className={styles.tags}>
                    {application.servicePostalCodes.map((postalCode) => <span key={postalCode}>{postalCode}</span>)}
                  </div>
                </div>
                <div>
                  <span><Gauge aria-hidden="true" size={15} />Printing services</span>
                  <div className={styles.tags}>
                    {application.printingServices.map((service) => <span key={service}>{service}</span>)}
                  </div>
                </div>
                <p>{application.serviceCategoryIds.length} service {application.serviceCategoryIds.length === 1 ? "category" : "categories"} selected · {application.equipment.length} equipment {application.equipment.length === 1 ? "entry" : "entries"}</p>
              </div>
            </section>

            <aside className={styles.updatePanel} aria-labelledby="latest-update-title">
              <div className={styles.updateIcon}><Bell aria-hidden="true" size={20} /></div>
              <p className={styles.panelEyebrow}>Latest update</p>
              <h2 id="latest-update-title">{latestEvent ? (eventActionLabels[latestEvent.action] ?? statusLabels[latestEvent.toStatus]) : status.label}</h2>
              <blockquote>{latestMessage}</blockquote>
              <time dateTime={latestUpdateAt.toISOString()}>{formatDateTime(latestUpdateAt)}</time>
              {state === "ACTION_REQUIRED" && (
                <p className={styles.actionNote}><AlertTriangle aria-hidden="true" size={15} />Follow the review team&apos;s note above. Contact partner support if any requested detail is unclear.</p>
              )}
              <Link className={styles.supportLink} href="/contact">Need help? Contact support</Link>
            </aside>
          </div>

          {application.status === "APPROVED" && profile && (
            <section className={styles.operationsPanel} id="operations" aria-labelledby="operations-title">
              <div className={styles.panelHeading}>
                <div>
                  <p>Approved operations</p>
                  <h2 id="operations-title">Marketplace availability</h2>
                </div>
                <Wifi aria-hidden="true" size={20} />
              </div>
              <div className={styles.operationStats}>
                <div>
                  <span>Operational status</span>
                  <strong className={profile.operationalStatus === "ACTIVE" ? styles.valuePositive : profile.operationalStatus === "SUSPENDED" ? styles.valueNegative : ""}>{profile.operationalStatus.charAt(0) + profile.operationalStatus.slice(1).toLowerCase()}</strong>
                </div>
                <div>
                  <span>Availability</span>
                  <strong>{profile.availabilityStatus.charAt(0) + profile.availabilityStatus.slice(1).toLowerCase()}</strong>
                </div>
                <div>
                  <span>Accepting orders</span>
                  <strong>{profile.acceptingOrders ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span>Approved on</span>
                  <strong>{formatDate(profile.approvedAt)}</strong>
                </div>
              </div>
              <div className={`${styles.activationState} ${profile.availabilityStatus === "ONLINE" && profile.acceptingOrders ? styles.activationOnline : ""}`}>
                <CircleDot aria-hidden="true" size={15} />
                <div>
                  <strong>{profile.operationalStatus === "INACTIVE"
                    ? "Approved — operational activation pending"
                    : profile.operationalStatus === "SUSPENDED"
                      ? "Approved — operations suspended"
                      : profile.operationalStatus === "CLOSED"
                        ? "Approved record — operations closed"
                      : profile.availabilityStatus === "OFFLINE"
                        ? "Approved and operational — currently offline"
                        : profile.availabilityStatus === "PAUSED"
                          ? "Approved and operational — order intake paused"
                          : profile.acceptingOrders
                            ? "Approved, online and accepting orders"
                            : "Approved and online — not accepting orders"}</strong>
                  <span>{profile.availabilityStatus === "ONLINE" && profile.acceptingOrders
                    ? "This partner profile is eligible to receive marketplace order offers."
                    : "No new marketplace orders will be offered while this state remains unchanged."}</span>
                </div>
              </div>
              <p className={styles.readOnlyNote}><CircleDot aria-hidden="true" size={14} />{profile.operationalStatus === "ACTIVE" ? "This approval snapshot is updated when you use the live operations workspace below." : "Live operations and assigned customer records are unavailable while this partner profile is not active."}</p>
            </section>
          )}

          {application.status === "APPROVED" && profile?.operationalStatus === "ACTIVE" && (
            <VendorOperationsWorkspace initialSuspended={false} />
          )}

          <section className={styles.panel} id="documents">
            <div className={styles.panelHeading}>
              <div>
                <p>Verification</p>
                <h2>Submitted documents</h2>
              </div>
              <FileCheck2 aria-hidden="true" size={20} />
            </div>
            {application.documents.length ? (
              <div className={styles.documentList}>
                {application.documents.map((document) => (
                  <article className={styles.documentRow} key={document.id}>
                    <div className={styles.documentIcon}><FileText aria-hidden="true" size={19} /></div>
                    <div className={styles.documentCopy}>
                      <strong>{documentLabels[document.type]}</strong>
                      <span>{document.originalName} · {formatBytes(document.sizeBytes)} · Uploaded {formatDate(document.createdAt)}</span>
                      {document.reviewNotes && <p>{document.reviewNotes}</p>}
                    </div>
                    <span className={`${styles.documentStatus} ${documentStatusClass(document.reviewStatus)}`}>{readableDocumentStatus(document.reviewStatus)}</span>
                    <a className={styles.downloadLink} href={`/api/vendor/documents/${document.id}`}>
                      <Download aria-hidden="true" size={15} />Download<span className={styles.srOnly}> {document.originalName}</span>
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyDocuments}><FileText aria-hidden="true" size={22} /><p>No documents are attached to this application.</p></div>
            )}
          </section>

          <section className={styles.panel} id="activity">
            <div className={styles.panelHeading}>
              <div>
                <p>Application activity</p>
                <h2>Status history</h2>
              </div>
              <Clock3 aria-hidden="true" size={20} />
            </div>
            <ol className={styles.timeline}>
              {application.events.map((event, index) => {
                const eventLabel = eventActionLabels[event.action] ?? statusLabels[event.toStatus];
                const eventState = event.action === "SUSPEND" ? "Suspended" : event.action === "REACTIVATE" ? "Reactivated" : statusLabels[event.toStatus];
                return (
                  <li key={event.id}>
                    <span className={`${styles.timelineMarker} ${index === 0 ? styles.timelineMarkerCurrent : ""}`}><CheckCircle2 aria-hidden="true" size={14} /></span>
                    <div className={styles.timelineCopy}>
                      <div><strong>{eventLabel}</strong><span>{eventState}</span></div>
                      {event.applicantMessage && <p>{event.applicantMessage}</p>}
                      <time dateTime={event.createdAt.toISOString()}>{formatDateTime(event.createdAt)}</time>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
