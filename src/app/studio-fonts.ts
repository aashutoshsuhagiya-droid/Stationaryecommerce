import { Aleo, Allura, Bebas_Neue, El_Messiri, Fredoka, Lato, Montserrat, Roboto } from "next/font/google";

/**
 * Web fonts for the 2D customisation studio (all SIL Open Font License).
 *
 * Each exposes a CSS variable named in `src/lib/studio-fonts.ts`; the canvas
 * renderer resolves those variables to the real family name. `preload: false`
 * keeps them off every page's critical path — they download only when a
 * studio actually draws with them.
 */
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-studio-montserrat", display: "swap", preload: false });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-studio-roboto", display: "swap", preload: false });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-studio-fredoka", display: "swap", preload: false });
const allura = Allura({ subsets: ["latin"], weight: "400", variable: "--font-studio-allura", display: "swap", preload: false });
const aleo = Aleo({ subsets: ["latin"], variable: "--font-studio-aleo", display: "swap", preload: false });
const elMessiri = El_Messiri({ subsets: ["latin"], variable: "--font-studio-el-messiri", display: "swap", preload: false });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-studio-bebas-neue", display: "swap", preload: false });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-studio-lato", display: "swap", preload: false });

export const studioFontVariables = [montserrat, roboto, fredoka, bebasNeue, allura, aleo, elMessiri, lato]
  .map((font) => font.variable)
  .join(" ");
