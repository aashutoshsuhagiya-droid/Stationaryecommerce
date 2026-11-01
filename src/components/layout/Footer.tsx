import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { NewsletterSignup } from "./NewsletterSignup";

function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function Footer() {
  const instagramUrl = process.env.NEXT_PUBLIC_INSTAGRAM_URL;

  return (
    <footer className="site-footer">
      <div className="footerTrending shell">
        <strong>Trending Searches</strong>
        <div>
          <Link href="/search?q=name+slips">Name slips</Link>
          <Link href="/search?q=gifts">Gifts</Link>
          <Link href="/search?q=notebook">Notebook</Link>
          <Link href="/search?q=stickers">Stickers</Link>
        </div>
      </div>

      <div className="footer-main footerMainMyntra shell">
        <div className="footerColumn">
          <h3>Shop</h3>
          <Link href="/products?category=customized-name-slips">Name Slips</Link>
          <Link href="/products?category=waterproof-stickers">Stickers</Link>
          <Link href="/products?category=personalized-pencils-pens">Pencils &amp; Pens</Link>
          <Link href="/products?category=school-labels">School Labels</Link>
          <Link href="/products?category=personalized-notebooks">Notebooks</Link>
          <Link href="/products?category=personalized-gifts">Personalised gifts</Link>
          <Link href="/bulk-orders">Bulk orders</Link>
        </div>

        <div className="footerColumn">
          <h3>Company</h3>
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/vendor/register">Become a vendor</Link>
          <Link href="/admin">Store admin</Link>
        </div>

        <div className="footerColumn">
          <h3>Help</h3>
          <Link href="/track-order">Track</Link>
          <Link href="/policies/shipping">Shipping</Link>
          <Link href="/policies/returns">Returns</Link>
        </div>

        <div className="footerColumn">
          <h3>Policies</h3>
          <Link href="/policies/terms">Terms</Link>
          <Link href="/policies/privacy">Privacy</Link>
        </div>

        <div className="footerColumn footerStay">
          <h3>Stay in loop</h3>
          <p>Fresh ideas, made personal.</p>
          <NewsletterSignup />
          <a href="mailto:hello@naamly.in"><Mail size={15} /> hello@naamly.in</a>
          {instagramUrl && <a href={instagramUrl} rel="noreferrer" target="_blank"><InstagramIcon size={16} /> Instagram</a>}
        </div>
      </div>

      <div className="footer-bottom footerBottomMyntra shell">
        <span>© {new Date().getFullYear()} Naamly. All rights reserved.</span>
        <span className="madeInIndia"><MapPin size={13} /> Made in India</span>
      </div>
    </footer>
  );
}
