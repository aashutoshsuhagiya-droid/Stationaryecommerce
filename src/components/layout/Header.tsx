"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleUserRound, Headphones, Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useStore } from "@/components/store/StoreProvider";

const navItems = [
  { label: "Name labels", href: "/products?category=customized-name-slips" },
  { label: "School essentials", href: "/products?category=school-labels" },
  { label: "Personalised gifts", href: "/products?category=personalized-gifts" },
  { label: "Bulk orders", href: "/bulk-orders" },
  { label: "Sell with us", href: "/vendor/register" },
];

export function Header() {
  const { cartCount, wishlist } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim()) {
      setMenuOpen(false);
      setSearchOpen(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <>
      <div className="announcement">
        <span>Thoughtfully personalised, carefully made</span>
        <Link href="/track-order">Track your order <span aria-hidden="true">→</span></Link>
      </div>
      <header className="site-header">
        <div className="header-main shell">
          <button className="icon-button mobile-menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu /></button>
          <Logo />
          <form className="header-search" onSubmit={submitSearch} role="search">
            <Search size={19} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search labels, gifts and school essentials" aria-label="Search products" />
            <kbd>⌘ K</kbd>
          </form>
          <nav className="header-actions" aria-label="Quick links">
            <Link href="/contact" className="support-link"><Headphones /><span><small>Need help?</small>Talk to us</span></Link>
            <button className="icon-button mobile-search-button" aria-label="Search" onClick={() => setSearchOpen(true)}><Search /></button>
            <Link href="/login" className="icon-button" aria-label="Sign in or access your account"><CircleUserRound /></Link>
            <Link href="/wishlist" className="icon-button count-button" aria-label={`Wishlist with ${wishlist.length} items`}><Heart /><span>{wishlist.length}</span></Link>
            <Link href="/cart" className="icon-button count-button" aria-label={`Cart with ${cartCount} items`}><ShoppingBag /><span>{cartCount}</span></Link>
          </nav>
        </div>
        <div className="nav-row shell">
          <Link href="/products" className="all-products-link"><span className="grid-dot-icon" aria-hidden="true">⠿</span> All products <ChevronDown size={15} /></Link>
          <nav className="primary-nav" aria-label="Primary navigation">
            {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
          <Link href="/products?sort=newest" className="new-link">New arrivals <span>New</span></Link>
        </div>
      </header>

      {menuOpen && <div className="mobile-drawer-backdrop" onMouseDown={() => setMenuOpen(false)}>
        <aside className="mobile-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Mobile navigation" aria-modal="true" role="dialog">
          <div className="drawer-header"><Logo /><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X /></button></div>
          <form className="drawer-search" onSubmit={submitSearch}><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What are you looking for?" aria-label="Search products" /></form>
          <nav>
            <Link href="/products">All products <span>→</span></Link>
            {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}<span>→</span></Link>)}
            <Link href="/track-order">Track order <span>→</span></Link>
            <Link href="/contact">Help & support <span>→</span></Link>
          </nav>
          <div className="drawer-note"><strong>Made for your name.</strong><p>Preview every personalised design before you order.</p></div>
        </aside>
      </div>}

      {searchOpen && <div className="search-overlay" aria-modal="true" role="dialog" aria-label="Product search">
        <form onSubmit={submitSearch} className="search-overlay-form"><Search aria-hidden="true" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Naamly" aria-label="Search products" /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X /></button></form>
      </div>}
    </>
  );
}
