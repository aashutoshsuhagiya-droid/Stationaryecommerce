import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  LockKeyhole,
  Mail,
  MapPin,
  PackageCheck,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import styles from "./customer.module.css";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol>
        <li><Link href="/">Home</Link></li>
        {items.map((item) => (
          <li key={`${item.label}-${item.href ?? "current"}`}>
            <ChevronRight aria-hidden="true" />
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`${styles.pageHero} ${compact ? styles.pageHeroCompact : ""}`}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{title}</h1>
        <p className={styles.heroDescription}>{description}</p>
        {children && <div className={styles.heroActions}>{children}</div>}
      </div>
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={`${styles.sectionHeading} ${align === "center" ? styles.centered : ""}`}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.primaryButton} href={href}>
      {children}<ArrowRight aria-hidden="true" />
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className={styles.secondaryButton} href={href}>{children}</Link>;
}

export function AssuranceStrip() {
  const items = [
    { icon: ShieldCheck, label: "Secure account access", text: "Your details stay private" },
    { icon: PackageCheck, label: "Order visibility", text: "See each confirmed update" },
    { icon: CircleHelp, label: "Human support", text: "Help when you need it" },
  ];

  return (
    <div className={styles.assuranceStrip}>
      {items.map(({ icon: Icon, label, text }) => (
        <div className={styles.assuranceItem} key={label}>
          <span className={styles.iconTile}><Icon aria-hidden="true" /></span>
          <span><strong>{label}</strong><small>{text}</small></span>
        </div>
      ))}
    </div>
  );
}

export function AuthAside({ mode }: { mode: "login" | "register" | "forgot" }) {
  const copy = {
    login: {
      title: "Everything personal, in one place.",
      text: "Sign in to revisit your designs, follow orders and make future purchases a little quicker.",
    },
    register: {
      title: "Save the thoughtful details.",
      text: "Create an account to keep designs, addresses and order updates together—ready whenever you are.",
    },
    forgot: {
      title: "A secure way back in.",
      text: "We’ll only use your email to help you recover access. Reset links should always be short-lived and single-use.",
    },
  }[mode];

  return (
    <aside className={styles.authAside}>
      <div className={styles.authIllustration} aria-hidden="true">
        <span className={styles.miniLabelOne}>AARAV</span>
        <span className={styles.miniLabelTwo}>MIRA</span>
        <Sparkles />
      </div>
      <p className={styles.eyebrow}>Your Naamly account</p>
      <h2>{copy.title}</h2>
      <p>{copy.text}</p>
      <ul className={styles.checkList}>
        <li><Check aria-hidden="true" /> Keep personalization details together</li>
        <li><Check aria-hidden="true" /> View accurate order progress</li>
        <li><Check aria-hidden="true" /> Get support with more context</li>
      </ul>
      <p className={styles.authPrivacy}><LockKeyhole aria-hidden="true" /> We never ask for your password over phone or message.</p>
    </aside>
  );
}

export function ContactMethods() {
  return (
    <div className={styles.contactMethods}>
      <a href="mailto:hello@naamly.in" className={styles.contactMethod}>
        <Mail aria-hidden="true" />
        <span><small>Email</small><strong>hello@naamly.in</strong><em>For orders and general help</em></span>
      </a>
      <Link href="/contact#message" className={styles.contactMethod}>
        <MessageCircle aria-hidden="true" />
        <span><small>Write to us</small><strong>Send a detailed message</strong><em>Best for personalisation or order questions</em></span>
      </Link>
      <div className={styles.contactMethod}>
        <Clock3 aria-hidden="true" />
        <span><small>Response timing</small><strong>Confirmed when your message is received</strong><em>No automated delivery-time promise</em></span>
      </div>
      <div className={styles.contactMethod}>
        <MapPin aria-hidden="true" />
        <span><small>Based in</small><strong>India</strong><em>Online orders delivered to serviceable PIN codes</em></span>
      </div>
    </div>
  );
}

export function StatusPill({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" | "navy" | "slate" }) {
  return <span className={`${styles.statusPill} ${styles[`status${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>{children}</span>;
}

export function Notice({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.notice}>
      <span>{icon ?? <CircleHelp aria-hidden="true" />}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}

export { styles };
