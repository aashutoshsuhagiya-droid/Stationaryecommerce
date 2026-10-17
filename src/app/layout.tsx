import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StoreProvider } from "@/components/store/StoreProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://naamly.example"),
  title: { default: "Naamly — Made for your name", template: "%s | Naamly" },
  description: "Thoughtfully personalised name labels, school essentials and gifts, made in India.",
  openGraph: { title: "Naamly — Made for your name", description: "Personalised essentials, previewed by you and carefully made.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
