import Link from "next/link";
import { Mail, MapPin, MessageCircle, ShieldCheck } from "lucide-react";

function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}
import { Logo } from "@/components/ui/Logo";
import { NewsletterSignup } from "./NewsletterSignup";

export function Footer() {
  const instagramUrl = process.env.NEXT_PUBLIC_INSTAGRAM_URL;
  return (
    <footer className="site-footer">
      <div className="newsletter shell">
        <div className="newsletter-copy"><span className="eyebrow light">The good-note club</span><h2>Fresh ideas, made personal.</h2><p>Occasional product news and practical gifting inspiration. No noisy inbox.</p></div>
        <NewsletterSignup />
      </div>
      <div className="footer-main shell">
        <div className="footer-brand"><Logo /><p>Personalised labels, school essentials and little gifts—thoughtfully designed and carefully produced in India.</p><div className="footer-contact"><a href="mailto:hello@naamly.in"><Mail size={17} /> hello@naamly.in</a><Link href="/contact"><MessageCircle size={17} /> Customer care</Link><span><MapPin size={17} /> Made in India</span></div></div>
        <div><h3>Shop</h3><Link href="/products?category=customized-name-slips">Name labels</Link><Link href="/products?category=school-labels">School essentials</Link><Link href="/products?category=personalized-gifts">Personalised gifts</Link><Link href="/bulk-orders">Bulk orders</Link></div>
        <div><h3>Help</h3><Link href="/faq">FAQs</Link><Link href="/track-order">Track an order</Link><Link href="/contact">Contact us</Link><Link href="/policies/shipping">Shipping</Link><Link href="/policies/returns">Returns & refunds</Link></div>
        <div><h3>About</h3><Link href="/about">Our story</Link><Link href="/policies/privacy">Privacy</Link><Link href="/policies/terms">Terms</Link><Link href="/admin">Store admin</Link>{instagramUrl && <a href={instagramUrl} rel="noreferrer" target="_blank"><InstagramIcon size={16} /> Instagram</a>}</div>
      </div>
      <div className="footer-bottom shell"><span>© {new Date().getFullYear()} Naamly. All rights reserved.</span><span><ShieldCheck size={16} /> Secure checkout · Transparent pricing</span></div>
    </footer>
  );
}
