"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Package,
  Palette,
  Search,
  Settings,
  ShoppingBag,
  Star,
  Tags,
  Users,
  UserRoundCheck,
  X,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import styles from "./admin.module.css";

const navigation = [
  {
    label: "Workspace",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag, count: "6" },
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/customizations", label: "Design templates", icon: Palette },
    ],
  },
  {
    label: "Relationships",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/vendor-applications", label: "Vendor applications", icon: UserRoundCheck },
      { href: "/admin/reviews", label: "Reviews", icon: Star, count: "1" },
      { href: "/admin/promotions", label: "Promotions", icon: Tags },
    ],
  },
  {
    label: "Store intelligence",
    items: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const titles: Record<string, string> = {
  "/admin": "Overview",
  "/admin/orders": "Orders & fulfillment",
  "/admin/products": "Product catalog",
  "/admin/customizations": "Design templates",
  "/admin/customers": "Customers",
  "/admin/vendor-applications": "Vendor applications",
  "/admin/reviews": "Reviews",
  "/admin/promotions": "Promotions",
  "/admin/reports": "Reports",
  "/admin/settings": "Store settings",
};

export function AdminShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const initials = email.slice(0, 2).toUpperCase();

  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className={styles.adminFrame}>
      {navOpen && (
        <button
          aria-label="Close navigation"
          className={styles.mobileBackdrop}
          onClick={() => setNavOpen(false)}
          type="button"
        />
      )}

      <aside className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <Link className={styles.brandHome} href="/admin">
            <span className={styles.brandMark}>N</span>
            <span className={styles.brandText}>
              <strong>Naamly</strong>
              <span>Control room</span>
            </span>
          </Link>
          <button
            aria-label="Close navigation"
            className={styles.closeNav}
            onClick={() => setNavOpen(false)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <nav aria-label="Admin navigation" className={styles.nav}>
          {navigation.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <p className={styles.navLabel}>{group.label}</p>
              {group.items.map((item) => {
                const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {item.count && <span className={styles.navCount}>{item.count}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.storeStatus}>
            <div className={styles.storeStatusTop}>
              <span className={styles.demoDot} /> Demo workspace
            </div>
            <p>Seed data only. No live orders, payments or shipping services are connected.</p>
            <Link className={styles.storeLink} href="/">
              View storefront <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </aside>

      <div className={styles.shellMain}>
        <header className={styles.topbar}>
          <button
            aria-label="Open navigation"
            className={`${styles.iconButton} ${styles.menuButton}`}
            onClick={() => setNavOpen(true)}
            type="button"
          >
            <Menu size={18} />
          </button>
          <div className={styles.topbarTitle}>
            <strong>{titles[pathname] ?? "Admin workspace"}</strong>
            <span>Saturday, 17 October</span>
          </div>

          <label className={styles.globalSearch}>
            <span className={styles.srOnly}>Search admin</span>
            <Search aria-hidden="true" size={15} />
            <input placeholder="Search orders, customers or products…" type="search" />
            <span className={styles.searchKey}>⌘ K</span>
          </label>

          <div className={styles.topActions}>
            <button aria-label="Notifications" className={styles.iconButton} type="button">
              <Bell size={17} />
              <span className={styles.noticeDot} />
            </button>
            <div className={styles.profileMenu}>
              <button aria-controls="admin-profile-actions" aria-expanded={profileOpen} className={styles.profileButton} onClick={() => setProfileOpen((open) => !open)} type="button">
                <span className={styles.profileAvatar}>{initials}</span>
                <span className={styles.profileCopy}>
                  <strong>{email}</strong>
                  <span>Super admin</span>
                </span>
                <ChevronDown size={13} />
              </button>
              {profileOpen && (
                <div className={styles.profileDropdown} id="admin-profile-actions">
                  <p>Signed in as <strong>{email}</strong></p>
                  <SignOutButton compact />
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={styles.pageArea}>
          <div className={styles.demoBanner}><strong>Preview data</strong><span>These records demonstrate the admin workflow. Connect the PostgreSQL repository before using operational metrics.</span></div>
          {children}
        </div>
      </div>
    </div>
  );
}
