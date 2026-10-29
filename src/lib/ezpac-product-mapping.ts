import type { EzpacFeatureBullet } from "./ezpac-feature-bullets";
import {
  EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS,
  type EzpacPackagingProductTypeId,
} from "./ezpac-packaging-presets";

export interface EzpacExportPrefill {
  /** e.g. ziplock: "outside paper, inside food-grade aluminium lining". */
  materialHint?: string;
  intro?: string;
  bestFor?: string[];
  featureBullets?: EzpacFeatureBullet[];
  /** 1-6 EzPac CDN image URLs, in export order (position 1 = hero). */
  imageUrls?: string[];
  /** Variant price floor, in INR; 0 = quote-only. */
  priceRupees: number;
}

export interface EzpacProductPresetMapping {
  /** Present only when the export title maps to a packaging starter. */
  presetId?: EzpacPackagingProductTypeId;
  shopifyHandle: string;
  shopifyTitle: string;
  /** Requires manual category selection in the admin flow. */
  unmapped?: true;
  prefills: EzpacExportPrefill;
}

/**
 * One-time, self-contained snapshot of docs/research/ezpac/products.json.
 * Saved products must remain independent from the research export, so the
 * importer's source copy is deliberately represented as plain typed data here.
 */
export const EZPAC_SHOPIFY_PRODUCT_MAPPING: readonly EzpacProductPresetMapping[] = [
  {
    unmapped: true,
    shopifyHandle: "cake-box-with-handle-box-with-handle",
    shopifyTitle: "Cake Box with handle",
    prefills: {
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Render_Mockup_4000_4000_2026-10-13.ezpac.3d.png?v=1791893254",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "slider-box-thick-wall",
    shopifyHandle: "slider-style-box",
    shopifyTitle: "Slider Box \u2014 Thick Wall",
    prefills: {
      intro: "Custom branded slider boxes with thick wall construction \u2014 a premium sliding drawer-style box that delivers a luxury unboxing experience. The thick walls give it a solid, high-quality feel perfect for premium chocolates, jewellery, cosmetics, and gifting. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Premium chocolate brands",
        "jewellery gifting",
        "luxury cosmetics",
        "premium D2C products",
        "wedding favours",
        "corporate gifting",
      ],
      featureBullets: [
        "thick-wall",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Slider_thick_wall_2.ezpac.3d.jpg?v=1776173715",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Slider_thick_wall_1.ezpac.3d.jpg?v=1776173715",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/sleeve_box_mockup.ezpac.3d.jpg?v=1776173715",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "window-box",
    shopifyHandle: "window-product-box",
    shopifyTitle: "Window Box",
    prefills: {
      intro: "Custom branded window product boxes \u2014 a clean, structured box with a transparent front window that lets your product be seen before the box is even opened. Creates an instant premium display impression on retail shelves and in gift hampers. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Cosmetic products",
        "food gifting",
        "accessories",
        "jewellery display",
        "D2C product brands",
        "retail shelf packaging",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/windowbox.ezpac.3d.png?v=1781963006",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "middle-hanging-box",
    shopifyHandle: "middle-hanging-box",
    shopifyTitle: "Middle Hanging Box",
    prefills: {
      intro: "Custom branded middle-hanging boxes \u2014 a sleek, vertical box with a centre hang hole that displays your product perfectly on retail hooks and peg boards. Ideal for accessories, cosmetics, and small product brands that want strong shelf presence. Full-colour custom printing with your logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Accessories brands",
        "cosmetics retail",
        "perfume vials",
        "small product retail",
        "pharmacy shelves",
        "hardware packs",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/middle_hanging_box_with_background.ezpac.3d.png?v=1781962788",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/middle_hanging_box1.ezpac.3d.png?v=1781962441",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "zipper-box",
    shopifyHandle: "product-box-with-zipper",
    shopifyTitle: "Zipper Box",
    prefills: {
      intro: "Custom branded product boxes with a built-in zipper closure \u2014 a unique, resealable packaging solution for products that customers open, use, and reseal. Perfect for cosmetics, skincare samples, and specialty food products where freshness and reusability matter. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Cosmetic sample kits",
        "skincare trial packs",
        "specialty food products",
        "luxury gifting",
        "D2C subscription brands",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/boxwithzipper.ezpac.3d.png?v=1781961163",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "food-tray",
    shopifyHandle: "food-tray",
    shopifyTitle: "Food Tray",
    prefills: {
      intro: "Custom branded food trays for restaurants, fast food counters, cloud kitchens, and food court businesses. Sturdy, food-safe trays with full-colour custom printing \u2014 your brand logo and design on every tray that reaches your customer. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Fast food restaurants",
        "food courts",
        "cloud kitchens",
        "canteens",
        "stadium food counters",
        "food festival stalls",
      ],
      featureBullets: [
        "food-safe",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/foodtray.ezpac.3d.jpg?v=1781960745",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "popcorn-box",
    shopifyHandle: "popcorn-box",
    shopifyTitle: "Popcorn Box",
    prefills: {
      intro: "Custom branded popcorn boxes for cinemas, food stalls, event caterers, and gourmet popcorn brands. The iconic bucket shape with full-colour custom printing \u2014 your logo, brand colours, and design on every box served. Turn every popcorn experience into a brand moment. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Gourmet popcorn brands",
        "event caterers",
        "food stalls",
        "movie nights",
        "corporate events",
        "birthday parties",
        "food truck businesses",
      ],
      featureBullets: [
        "custom-branding",
        "food-safe",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/popcorn.ezpac.3d.jpg?v=1781959910",
      ],
      priceRupees: 0,
    },
  },
  {
    unmapped: true,
    shopifyHandle: "display-tray",
    shopifyTitle: "Display Tray",
    prefills: {
      intro: "Custom branded display trays for retail shelves, product showcases, and point-of-sale displays. Perfect for presenting multiple products attractively in a shop, at an exhibition stall, or inside a gifting hamper. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Retail stores",
        "exhibition stalls",
        "jewellery displays",
        "cosmetic counters",
        "gifting brands",
        "product launch showcases",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/displaytray.ezpac.3d_ac87f4f6-1809-4118-9852-b09cdfdd5e6d.jpg?v=1781958860",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "side-open-box",
    shopifyHandle: "side-open-tuck-in-box",
    shopifyTitle: "Side Open Box",
    prefills: {
      intro: "Custom branded side-open tuck-in boxes \u2014 a slim, elegant packaging style where the product slides in from the side for a clean, premium presentation. Ideal for cosmetic products, stationery, and small accessories that need structured, professional packaging. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Cosmetic products",
        "lip balms",
        "compact accessories",
        "stationery items",
        "sample packaging",
        "premium gifting",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/sideopenbox.ezpac.3d.jpg?v=1781957889",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "tissue-paper-box",
    shopifyHandle: "tissue-paper-box",
    shopifyTitle: "Tissue Paper Box",
    prefills: {
      intro: "Custom branded tissue paper boxes for restaurants, hotel rooms, spas, salons, and premium retail environments. Turn a functional product into a branded touchpoint \u2014 your logo and design on every tissue box placed on tables, counters, and shelves. Full-colour custom printing with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Restaurants",
        "hotels",
        "salons",
        "spas",
        "premium retail",
        "corporate offices",
        "event venues",
        "gifting hampers",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/tissue.ezpac.3d.jpg?v=1777554364",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "hanging-box",
    shopifyHandle: "box-with-hanging-tab",
    shopifyTitle: "Hanging Box",
    prefills: {
      intro: "Custom branded hanging boxes with a top tab for hook display \u2014 perfect for retail shelves, pharmacy counters, exhibition hooks, and point-of-sale displays. Your product stays secure inside while your brand is fully visible from the front. Full-colour custom printing with your logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Retail shelf display",
        "pharmacy products",
        "accessories brands",
        "cosmetic counters",
        "exhibition stalls",
        "hardware packaging",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/boxwithhangingtab.ezpac.3d.jpg?v=1781955100",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "cosmetic-beauty-box-with-inside-holder",
    shopifyHandle: "cosmetic-box-with-inside-holder",
    shopifyTitle: "Cosmetic / Beauty Box with Inside Holder",
    prefills: {
      intro: "Custom branded cosmetic boxes with an internal holder \u2014 premium packaging that keeps your product perfectly centred and secure inside the box. Ideal for serum bottles, perfume vials, lipsticks, and premium beauty products where presentation is everything. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Premium skincare brands",
        "serum brands",
        "luxury beauty gifting",
        "perfume brands",
        "high-end cosmetic products",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/102680_cosmetic_Box.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "soap-box",
    shopifyHandle: "soap-box",
    shopifyTitle: "Soap Box",
    prefills: {
      intro: "Custom branded soap boxes for soap brands, handmade soap businesses, skincare startups, and natural beauty brands. Clean, sturdy packaging with full-colour custom printing \u2014 your brand name, logo, ingredients, and design on every box. Make your soap brand look professional from day one. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Handmade soap brands",
        "natural skincare businesses",
        "bath and body brands",
        "ayurvedic soap brands",
        "gifting soap sets",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/soapbox.ezpac.3d.png?v=1778328233",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "d2c-mailer-bag",
    shopifyHandle: "unique-sample-product-box",
    shopifyTitle: "D2C Mailer Bag",
    prefills: {
      intro: "Custom printed courier and mailer bags for D2C brands, e-commerce sellers, and online businesses. Make every delivery a brand experience \u2014 your logo, brand colours, and design printed on durable, tamper-evident bags. Say goodbye to plain polybags. Customers receive your parcel and see your brand first. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "D2C brands",
        "Shopify stores",
        "Meesho/Amazon sellers",
        "fashion brands",
        "skincare brands",
        "any business shipping orders",
      ],
      featureBullets: [
        "tamper-evident",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/PRISA_HOMES.ezpac.3d.png?v=1782552037",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/GLITZ_WESTERN.ezpac.3d.png?v=1782552036",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/image_22_.ezpac.3d.png?v=1782552036",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/FIOREBLISS.ezpac.3d.png?v=1782552057",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "brand-ziplock-pouch",
    shopifyHandle: "25-grams-ziplock-pouch",
    shopifyTitle: "Brand Ziplock Pouch",
    prefills: {
      materialHint: "outside paper, inside food-grade aluminium lining",
      intro: "Custom printed ziplock paper pouches \u2014 outside paper, inside food-grade aluminium lining that keeps products fresh, moisture-free, and shelf-ready. Perfect for dry fruits, coffee, tea, protein mixes, spices, masala, and snack brands that want branded packaging without a plain sticker. Your logo, brand colours, and product name fully printed on the pouch. No graphic designer needed \u2014 design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Dry fruit brands",
        "coffee and tea brands",
        "protein mix brands",
        "spice and masala businesses",
        "snack brands",
        "health food startups",
        "gifting food brands",
      ],
      featureBullets: [
        "food-grade-lining",
        "no-designer-needed",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Ziplock7.ezpac.3d.jpg?v=1776323978",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Ziplock6.ezpac.3d.jpg?v=1776323978",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Ziplock2.ezpac.3d_b2f5c13e-46b1-48ce-b7b5-4980fbf685b9.jpg?v=1776323978",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Ziplock5.ezpac.3d.jpg?v=1776323978",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Ziplock10.ezpac.3d.jpg?v=1776323978",
      ],
      priceRupees: 0,
    },
  },
  {
    presetId: "stickers",
    shopifyHandle: "round-stickers",
    shopifyTitle: "Round Stickers",
    prefills: {
      intro: "Custom printed round stickers for D2C brands, home bakers, product brands, and small businesses. The most versatile branding tool \u2014 seal your packaging, brand your jars, label your products, or add a personal touch to every order. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Packaging seals",
        "jar and bottle labels",
        "courier bag branding",
        "gifting stickers",
        "brand logo seals",
        "candle labels",
        "food product labels",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Round1.ezpac.3d.jpg?v=1776172463",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Round2.ezpac.3d.jpg?v=1776172609",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "stickers",
    shopifyHandle: "stickers",
    shopifyTitle: "Rectangle & Square Stickers",
    prefills: {
      intro: "Custom printed rectangle and square stickers for D2C brands, e-commerce sellers, home bakers, and small businesses. Add your logo, brand name, website, QR code, or any design \u2014 and use them for product sealing, packaging branding, gifting labels, and marketing collateral. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Product packaging seals",
        "courier bag branding",
        "jar labels",
        "gifting stickers",
        "brand logo stickers",
        "event giveaways",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Rectangle1.ezpac.3d.jpg?v=1776172587",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Rectangle2.ezpac.3d.jpg?v=1776172564",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Rectangle3.ezpac.3d.jpg?v=1776172552",
      ],
      priceRupees: 0,
    },
  },
  {
    unmapped: true,
    shopifyHandle: "money-cover-envelope",
    shopifyTitle: "Shagun Envelope",
    prefills: {
      intro: "Custom printed money envelopes and shagun covers \u2014 beautifully designed for weddings, festivals, and gifting occasions. Add your family name, brand name, custom design, or personal message. A premium alternative to plain envelopes for Diwali, Eid, weddings, and corporate gifting. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Weddings",
        "shagun gifting",
        "Diwali envelopes",
        "Eid gifting",
        "corporate cash gifting",
        "event planners",
        "jewellery shops",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "premium-card-stock",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/wedding.ezpac.3d.jpg?v=1775201962",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/rupal.ezpac.3d.jpg?v=1775201962",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/shrinathji.ezpac.3d.jpg?v=1775201962",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/dipesh.ezpac.3d.jpg?v=1775201962",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/trial.ezpac.3d.jpg?v=1775201962",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/trial2.ezpac.3d.jpg?v=1775201962",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "gift-box-with-window",
    shopifyHandle: "gift-box-with-window",
    shopifyTitle: "Gift Box with Window",
    prefills: {
      intro: "Custom branded gift boxes with a clear window \u2014 let your product speak for itself while your brand surrounds it. The window front creates an instant premium unboxing impression, perfect for chocolates, jewellery, cosmetics, and artisan products. Full-colour custom printing with your logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Chocolate gifting",
        "jewellery brands",
        "cosmetic gift sets",
        "artisan food brands",
        "wedding favours",
        "premium hampers",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/giftboxwithwindow.ezpac.3d.jpg?v=1763620097",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "custom-branded-laminated-carry-bag",
    shopifyHandle: "laminated-shopping-bags-with-thread-handle",
    shopifyTitle: "Custom Branded Laminated Carry Bag",
    prefills: {
      intro: "Custom printed laminated shopping bags with thread handle \u2014 premium, glossy finish bags that make your brand look luxury from the moment a customer walks out of your store. Strong thread handles, durable laminated surface, and full-colour custom printing with your logo, brand name, and design. The ultimate walking advertisement for your brand. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Boutiques",
        "jewellery stores",
        "fashion brands",
        "skincare stores",
        "gifting brands",
        "exhibition stalls",
        "wedding shopping",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Paper_1shopping_bag_mockup.ezpac.3d.jpg?v=1761738734",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/thread_handle_Paper_shopping_bag_mockup.ezpac.3d.jpg?v=1761738734",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Paper_shopping_bag_mockup.ezpac.3d.jpg?v=1761738734",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "folded-business-card",
    shopifyHandle: "folded-business-card",
    shopifyTitle: "Folded Business Card",
    prefills: {
      intro: "Custom printed folded business cards \u2014 a premium, double-layered card that gives you twice the space for your brand story, contact details, services, and design. Makes a strong first impression at meetings, exhibitions, and networking events. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Consultants",
        "premium service brands",
        "architects",
        "photographers",
        "boutique business owners",
        "creative professionals",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Folded_business_card_mockup.ezpac.3d.jpg?v=1761734676",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/24200001_business_Card_Folded.png?v=1761735162",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "business-card",
    shopifyHandle: "business-card",
    shopifyTitle: "Business Card",
    prefills: {
      intro: "Custom printed business cards that make your brand memorable. Premium quality card stock with full-colour printing on one or both sides \u2014 add your logo, contact details, tagline, and brand colours. Design in our free online studio with live preview. Perfect for professionals, freelancers, retail shops, and D2C brand founders. MOQ starts at just 10 pieces.",
      bestFor: [
        "Entrepreneurs",
        "small businesses",
        "freelancers",
        "retail shops",
        "startup founders",
        "exhibition networking",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/608010_business_card1.ezpac.3d.png?v=1761719998",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/608010_business_Card.ezpac.3d.png?v=1761720006",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/608010_business_card2.ezpac.3d.png?v=1761719997",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "a4-flyer",
    shopifyHandle: "a4-flyer",
    shopifyTitle: "A4 Flyer",
    prefills: {
      intro: "Custom printed A4 flyers for restaurants, retail stores, event promotions, and service businesses. Full-colour single or double-sided printing on high-quality paper stock. Design your flyer in our free online studio \u2014 upload your logo, add text, choose your layout \u2014 and preview before ordering. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Menu cards",
        "promotional offers",
        "product launches",
        "event announcements",
        "exhibition handouts",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/A4_menu_flyer_mockup.ezpac.3d.jpg?v=1761819364",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/608040_A4_FLyer.ezpac.3d.png?v=1761819364",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "four-fold-brochure",
    shopifyHandle: "brochure-four-fold",
    shopifyTitle: "Four Fold Brochure",
    prefills: {
      intro: "Custom printed four-fold brochures \u2014 ideal for product catalogues, service menus, event guides, and detailed brand communication. Printed on premium paper stock with full-colour on one or both sides. Design directly in our free studio with 3D preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Product catalogues",
        "wedding brochures",
        "restaurant menus",
        "corporate presentations",
        "real estate listings",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/A5_four_fold_brochure_mockup.ezpac.3d.jpg?v=1761819395",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Brochure_four_fold.png?v=1761819395",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "tri-fold-brochure",
    shopifyHandle: "brochure-tri-fold",
    shopifyTitle: "Tri Fold Brochure",
    prefills: {
      intro: "Custom printed tri-fold brochures \u2014 the most popular format for brand introductions, service menus, and event programs. Compact, professional, and easy to hand out. Full-colour printing on both sides. Design in our free 3D studio with live preview \u2014 no graphic designer needed. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Brand introduction kits",
        "restaurant menus",
        "wedding programs",
        "travel guides",
        "exhibition handouts",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/A5_tri_fold_brochure_mockup.ezpac.3d.jpg?v=1761819418",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/24200403_Brochure_tri_fold.png?v=1761819418",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "z-fold-brochure",
    shopifyHandle: "brochure-z-fold",
    shopifyTitle: "Z Fold Brochure",
    prefills: {
      intro: "Custom printed Z-fold brochures \u2014 a sleek, modern format that unfolds in a zigzag pattern, perfect for step-by-step brand storytelling, product guides, and lookbooks. Full-colour printing on premium stock. Design in our free 3D studio with real-time preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Brand storytelling",
        "how-to guides",
        "skincare routines",
        "step-by-step product usage",
        "lookbooks",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Z-fold_brochure_mockup.ezpac.3d.jpg?v=1761819434",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/242001_Brochure_Z_Fold.png?v=1761819434",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "thank-you-card",
    shopifyHandle: "thank-you-cad-square",
    shopifyTitle: "Thank You Card",
    prefills: {
      intro: "Custom printed thank you cards for D2C brands, e-commerce sellers, and small businesses that want to build customer loyalty with every order. A personalised thank you card inside your parcel is proven to drive repeat purchases and positive reviews. Add your brand logo, a custom message, discount code for next order, and social handles. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "D2C brands",
        "Shopify sellers",
        "home bakers",
        "gifting brands",
        "subscription box businesses",
        "any brand shipping orders",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/thank_you_card__1_.ezpac.3d.jpg?v=1782552204",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/happy_diwali.ezpac.3d.png?v=1782552202",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Care_Card.ezpac.3d.png?v=1782552204",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/thank_you_card__5_.ezpac.3d.jpg?v=1782552205",
      ],
      priceRupees: 5,
    },
  },
  {
    presetId: "oval-thank-you-card",
    shopifyHandle: "thank-you-discount-oval-card",
    shopifyTitle: "Thank You Card \u2014 Oval",
    prefills: {
      intro: "Custom printed oval thank you cards \u2014 a distinctive, premium shape that stands out from standard rectangular cards. The oval format feels special and handcrafted, perfect for artisan brands, boutique businesses, and gifting brands that want every detail to reflect their brand personality. Add your logo, message, and discount code. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Artisan brands",
        "boutique gifting",
        "jewellery businesses",
        "handmade product sellers",
        "premium D2C brands",
        "home bakers",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/270070_Thank_YOu_Oval_Card2.ezpac.3d.jpg?v=1761719994",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/270070_Thank_YOu_Oval_Card.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 5,
    },
  },
  {
    presetId: "folded-thank-you-card",
    shopifyHandle: "thank-you-card-folded",
    shopifyTitle: "Thank You Card \u2014 Folded",
    prefills: {
      intro: "Custom printed folded thank you cards \u2014 a premium, double-panel card that gives you more space for your brand message, customer note, discount offer, and design. Unfolds to reveal your full message inside \u2014 a memorable touch that makes customers feel valued and drives repeat orders. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Premium D2C brands",
        "gifting businesses",
        "subscription boxes",
        "home bakers",
        "jewellery brands",
        "any business wanting to add a luxury touch to orders",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/242020_folded_thank_you_card.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 5,
    },
  },
  {
    presetId: "hang-tags",
    shopifyHandle: "hang-tags",
    shopifyTitle: "Hang Tags",
    prefills: {
      intro: "Custom printed hang tags for fashion brands, clothing labels, jewellery, accessories, and D2C product businesses. Add your brand logo, product details, care instructions, price, QR code, or social handle \u2014 all in your brand colours and typography. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Fashion brands",
        "clothing labels",
        "jewellery brands",
        "accessories businesses",
        "handmade product sellers",
        "D2C lifestyle brands",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Rectangular_clothing_label_mockup.ezpac.3d.jpg?v=1761735709",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "parcel-bag",
    shopifyHandle: "parcel-bag-with-handle",
    shopifyTitle: "Parcel Bag",
    prefills: {
      intro: "Custom printed parcel bags with hand handle \u2014 a sturdy, branded alternative to plain polybags for businesses that hand-deliver orders or sell at local markets and exhibitions. Your logo and brand design on a strong bag with a comfortable carry handle. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Local delivery businesses",
        "boutique shops",
        "market sellers",
        "food brands",
        "gifting businesses",
        "home delivery startups",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Paper_bag_with_handle_mockup1.ezpac.3d.jpg?v=1761737814",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/220041_D_cut_bags.ezpac.3d.jpg?v=1761737814",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "d-cut-paper-bag",
    shopifyHandle: "bags-with-hand-handle",
    shopifyTitle: "D-Cut Paper Bag",
    prefills: {
      intro: "Custom printed D-cut paper bags with hand-cut hole handle \u2014 perfect for retail shops, boutiques, gifting, and food takeaway brands. Strong, eco-friendly kraft or art paper base with full-colour custom printing. Add your brand logo, colours, and design directly in our free 3D studio and preview exactly how your bag will look before placing the order. MOQ starts at just 10 pieces.",
      bestFor: [
        "Retail shops",
        "boutique stores",
        "gifting brands",
        "food takeaway",
        "exhibition stalls",
      ],
      featureBullets: [
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/12382097.ezpac.3d.jpg?v=1780047517",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "unboxing-experience-box",
    shopifyHandle: "sweet-box-front-opening",
    shopifyTitle: "Unboxing Experience Box",
    prefills: {
      intro: "Custom branded product boxes with front opening \u2014 a flip-top style that creates a dramatic, premium unboxing experience. When the front panel opens, your product is revealed front-and-centre. Ideal for D2C brands, subscription boxes, and premium product gifting. Full-colour custom printing with your logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "D2C brands",
        "subscription boxes",
        "premium gifting",
        "skincare kits",
        "sweet boxes",
        "product launch packaging",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/sweet_box_flip_top_mailer_box_packaging_mockup.ezpac.3d.jpg?v=1761738031",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "flower-box",
    shopifyHandle: "flower-box",
    shopifyTitle: "Flower Box",
    prefills: {
      intro: "Custom branded flower boxes for florists, gifting brands, wedding planners, and boutique flower businesses. Elegant, sturdy construction designed to hold fresh and artificial flower arrangements securely. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Florists",
        "wedding gifting",
        "Valentine's Day arrangements",
        "anniversary gifts",
        "boutique flower brands",
        "event planners",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/112031_flower_box.ezpac.3d.jpg?v=1761719994",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/112031_flower_box.ezpac.3d.png?v=1761720004",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "pooja-box",
    shopifyHandle: "pooja-box",
    shopifyTitle: "Pooja Box",
    prefills: {
      intro: "Custom branded pooja boxes for religious product brands, temple gift shops, puja kit sellers, and festive gifting businesses. Elegant, reverential packaging with full-colour custom printing \u2014 your brand name, logo, and design on every box. Perfect for Diwali puja kits, prasad packaging, and sacred product gifting. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Puja kit brands",
        "prasad packaging",
        "temple gift shops",
        "Diwali gifting",
        "religious product businesses",
        "festive hamper brands",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/102010_pooja_box.ezpac.3d.jpg?v=1761719995",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "sachet-box",
    shopifyHandle: "sachet-box",
    shopifyTitle: "Sachet Box",
    prefills: {
      intro: "Custom branded sachet boxes for single-serve food, beverage, supplement, and personal care brands. Compact, slim packaging designed to hold sachets securely with full-colour custom printing \u2014 your brand name, logo, ingredients, and design on every box. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Coffee and tea sachet brands",
        "protein supplement brands",
        "skincare sachet products",
        "spice brands",
        "health drink startups",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/102010_sachet_box.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "food-delivery-box",
    shopifyHandle: "food-delievery-box",
    shopifyTitle: "Food Delivery Box",
    prefills: {
      intro: "Custom branded food delivery boxes for restaurants, cloud kitchens, tiffin services, and food delivery businesses. Strong, food-safe corrugated construction with full-colour custom printing \u2014 make every delivery a branded experience. Your logo and design on every box that goes out. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Cloud kitchens",
        "restaurants",
        "tiffin services",
        "meal prep brands",
        "food delivery startups",
        "catering businesses",
      ],
      featureBullets: [
        "food-safe",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/102010_food_parcel_box.ezpac.3d.jpg?v=1761719995",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "pen-set-box",
    shopifyHandle: "pen-set-box",
    shopifyTitle: "Pen Set Box",
    prefills: {
      intro: "Custom branded pen set boxes for stationery brands, corporate gifting, and premium office supply packaging. Sleek, pillow-style box that holds pen sets and writing instruments securely with a premium presentation. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Stationery brands",
        "corporate gifting",
        "pen gifting",
        "office supply brands",
        "award gifting",
        "premium packaging for writing instruments",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/603600_pen_set_pillow_box.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "mobile-cover-box",
    shopifyHandle: "mobile-cover-box",
    shopifyTitle: "Mobile Cover Box",
    prefills: {
      intro: "Custom branded mobile cover boxes for phone accessories brands, mobile cover businesses, and electronics retail. Sleek, compact packaging with full-colour custom printing \u2014 display your brand, product name, compatibility details, and design on a box that looks professional in every retail or D2C setting. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Mobile cover brands",
        "phone accessories businesses",
        "electronics retail",
        "online mobile cover sellers",
        "gadget brands",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/603600_mobile_phone_case.ezpac.3d.jpg?v=1761719994",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/603600_mobile_phone.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "soap-pillow-box",
    shopifyHandle: "shawl-box",
    shopifyTitle: "Soap Pillow Box",
    prefills: {
      intro: "Custom branded soap boxes in a pillow style \u2014 an elegant, curved packaging shape that gives handmade and artisan soap brands a boutique, premium look. Easy to assemble, eye-catching on retail shelves, and beautiful enough to gift directly. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Artisan soap brands",
        "handmade soap businesses",
        "bath and body gifting",
        "luxury soap packaging",
        "natural skincare brands",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/603600_Shwal_pillow_box.ezpac.3d_7fcc0a1a-1ae3-4227-8a88-b557fe5d95d9.jpg?v=1761820234",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "pillow-box",
    shopifyHandle: "pillow-box",
    shopifyTitle: "Pillow Box",
    prefills: {
      intro: "Custom branded pillow boxes \u2014 a graceful, curved shape that instantly elevates the presentation of jewellery, small gifts, accessories, and confectionery. Easy to assemble, strong enough to protect the product, and beautiful enough to gift directly. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Jewellery brands",
        "accessories gifting",
        "wedding favours",
        "chocolate gifting",
        "small product packaging",
        "boutique retail",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/603600_pillow_BOx.ezpac.3d.jpg?v=1761719995",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "chocolate-triangle-box",
    shopifyHandle: "choclate-triangle-box",
    shopifyTitle: "Chocolate Triangle Box",
    prefills: {
      intro: "Custom branded chocolate triangle boxes \u2014 a unique, eye-catching pyramid shape that makes your chocolate or confectionery product instantly stand out on a shelf or in a gift hamper. Food-safe material with full-colour custom printing. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Chocolate brands",
        "premium mithai",
        "wedding favours",
        "festival gifting",
        "boutique confectionery",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/181060_choclate_triangle_box.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "paan-box",
    shopifyHandle: "paan-box",
    shopifyTitle: "Paan Box",
    prefills: {
      intro: "Custom branded paan boxes for paan shops, meetha paan brands, and premium betel leaf gifting businesses. Food-safe, compact packaging with full-colour custom printing \u2014 your brand name, logo, and design on every box. Make your paan brand memorable and giftable. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Paan shops",
        "premium meetha paan brands",
        "paan gifting",
        "wedding paan counters",
        "mouth freshener brands",
      ],
      featureBullets: [
        "food-safe",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/181060_paan_box.ezpac.3d.jpg?v=1761719995",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "cereal-box",
    shopifyHandle: "cereal-box",
    shopifyTitle: "Cereal Box",
    prefills: {
      intro: "Custom branded cereal boxes for food brands, health food startups, muesli brands, and breakfast product businesses. Sturdy, food-grade packaging with full-colour custom printing \u2014 your brand name, logo, nutritional info, and design printed to spec. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Cereal brands",
        "muesli startups",
        "health food brands",
        "breakfast product launches",
        "D2C food businesses",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "food-grade-lining",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Cereal_box_mockup.ezpac.3d.jpg?v=1761734676",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "perfume-box",
    shopifyHandle: "perfume-box",
    shopifyTitle: "Perfume Box",
    prefills: {
      intro: "Custom branded perfume boxes for fragrance brands, attar businesses, and luxury personal care brands. Your customer smells your fragrance later \u2014 they see your box first. Premium quality packaging with full-colour custom printing, gold foil options, and custom sizes to fit any bottle. Design in our free 3D studio with live preview. No graphic designer needed. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Perfume brands",
        "attar businesses",
        "luxury gifting",
        "fragrance startups",
        "personal care brands",
        "D2C fragrance founders",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "no-designer-needed",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/100010_perfume_box1.ezpac.3d.jpg?v=1761719995",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/100010_perfume_box.ezpac.3d.jpg?v=1761719995",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "cosmetic-beauty-brand-box",
    shopifyHandle: "cosmetic-bottle-box",
    shopifyTitle: "Cosmetic / Beauty Brand Box",
    prefills: {
      intro: "Custom branded cosmetic boxes for skincare, makeup, beauty, and personal care brands. Premium quality packaging with full-colour custom printing \u2014 add your brand logo, product name, ingredients list, and design. Available in custom sizes to fit serums, moisturisers, lip products, and more. Design in our free 3D studio with live preview. No graphic designer needed. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Skincare brands",
        "makeup brands",
        "beauty startups",
        "D2C cosmetic founders",
        "personal care product businesses",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "no-designer-needed",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/102680_cosmetic_Box.ezpac.3d.jpg?v=1761719994",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "gift-box",
    shopifyHandle: "gift-box",
    shopifyTitle: "Gift Box",
    prefills: {
      intro: "Custom branded gift boxes for gifting brands, wedding planners, festive hampers, and premium product packaging. Elegant construction with full-colour custom printing \u2014 your logo, brand colours, and design on a box that makes every gift feel special. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Gifting brands",
        "wedding hampers",
        "festival gifting",
        "corporate gift packaging",
        "jewellery brands",
        "luxury product packaging",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/giftboxwithhandlemockup.ezpac.3d.jpg?v=1761736308",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "food-parcel-box",
    shopifyHandle: "food-parcel-box",
    shopifyTitle: "Food Parcel Box",
    prefills: {
      intro: "Custom branded food parcel boxes with handle \u2014 perfect for restaurants, cloud kitchens, and takeaway businesses that want their delivery to look as good as the food inside. Food-safe construction with built-in carry handle and full-colour custom printing. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Takeaway restaurants",
        "cloud kitchens",
        "biriyani brands",
        "meal kit businesses",
        "tiffin services",
        "food gifting",
      ],
      featureBullets: [
        "food-safe",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Food_box_with_handle_mockup.ezpac.3d.jpg?v=1772952486",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Tuck_end_box_variations_reverse_three_button_bottom_suitcases.ezpac.3d.jpg?v=1772952486",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "slider-box-thin-wall",
    shopifyHandle: "slider-chocolate-box",
    shopifyTitle: "Slider Box \u2014 Thin Wall",
    prefills: {
      intro: "Custom branded slider boxes with thin wall construction \u2014 a sleek, modern sliding-drawer style packaging at a lighter weight and more accessible price point. Perfect for chocolates, small gifts, accessories, and retail products that need a premium look without the premium bulk. Full-colour custom printing with your brand logo and design. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Chocolate brands",
        "small gifting",
        "accessories packaging",
        "retail product boxes",
        "festive favours",
        "D2C product brands",
      ],
      featureBullets: [
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Gift_sleeve_box_mockup.ezpac.3d.jpg?v=1761734676",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "mithai-box-top-bottom-style",
    shopifyHandle: "sweet-box-top-bottom-style",
    shopifyTitle: "Mithai Box \u2014 Top Bottom Style",
    prefills: {
      intro: "Custom branded sweet boxes in classic top-and-bottom style \u2014 a timeless, elegant packaging format for mithai shops, home sweet businesses, and festive gifting brands. Food-safe, sturdy construction with full-colour custom printing. Your brand name, logo, and design on every box that a customer gifts or receives. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Mithai shops",
        "home sweet businesses",
        "Diwali gifting",
        "wedding sweets",
        "festive hampers",
        "premium ladoo and barfi brands",
      ],
      featureBullets: [
        "food-safe",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/sweet_Boxes_with_lid_double_ears_craft_with_lid.ezpac.3d.jpg?v=1761742625",
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/150010_sweet_box.ezpac.3d.jpg?v=1761742625",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "chocolate-pack-box",
    shopifyHandle: "chocolate-pack-box",
    shopifyTitle: "Chocolate Pack Box",
    prefills: {
      intro: "Custom branded chocolate pack boxes \u2014 the classic top-and-bottom lid style perfect for premium chocolate assortments, truffle collections, and festive gifting. Food-safe, sturdy construction with full-colour custom printing on all sides. Design your box with your logo and brand identity in our free 3D studio. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Premium chocolate brands",
        "truffle boxes",
        "festival gifting",
        "wedding favours",
        "corporate chocolate gifting",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "food-safe",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Boxes_with_lid_open_top_bottom_double_ears_craft_with_lid.ezpac.3d.jpg?v=1761734676",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "snack-box",
    shopifyHandle: "snack-box",
    shopifyTitle: "Snack Box",
    prefills: {
      intro: "Custom branded snack boxes for snack brands, namkeen businesses, dry fruit gifting, and food startups. Sturdy, food-safe packaging with full-colour custom printing \u2014 your brand name, logo, flavour details, and design on every box. Make your snack brand shelf-ready and D2C-ready from just 10 pieces. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Snack brands",
        "namkeen businesses",
        "dry fruit gifting",
        "protein snack startups",
        "makhana brands",
        "nut mix businesses",
      ],
      featureBullets: [
        "food-safe",
        "custom-branding",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Tuck_end_software_box_mockup.ezpac.3d.jpg?v=1761734676",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "square-box",
    shopifyHandle: "square-box",
    shopifyTitle: "Square Box",
    prefills: {
      intro: "Custom branded square boxes \u2014 a versatile, clean-lined packaging format that works for almost any product category. Strong, structured, and fully customisable in size and design. Add your brand logo, colours, product name, and design in our free 3D studio with live preview. Whether you sell cosmetics, jewellery, gifts, or food products \u2014 this box adapts to your brand. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Cosmetic products",
        "jewellery gifting",
        "food packaging",
        "subscription boxes",
        "product retail",
        "D2C brands across all categories",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/Square_box_mockup.ezpac.3d.jpg?v=1761734676",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "brownie-box",
    shopifyHandle: "brownie-box",
    shopifyTitle: "Brownie Box",
    prefills: {
      intro: "Custom branded brownie boxes for home bakers, cloud kitchens, gifting brands, and bakery businesses. Sturdy, food-safe construction with full-colour custom printing \u2014 your logo, brand colours, and design printed exactly as you want. Design for free in our 3D studio and preview your box before ordering. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Home bakers",
        "brownie businesses",
        "dessert gifting brands",
        "cloud kitchens",
        "festive hampers",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "food-safe",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/brownie_box_mockup.ezpac.3d.jpg?v=1761737117",
      ],
      priceRupees: 10,
    },
  },
  {
    presetId: "chocolate-box",
    shopifyHandle: "sweet-box",
    shopifyTitle: "Chocolate Box",
    prefills: {
      intro: "Custom branded chocolate boxes for chocolate brands, gifting businesses, mithai shops, and home confectionery brands. Food-safe, elegant packaging with full-colour custom printing \u2014 your logo, brand colours, and design perfectly printed. Design for free in our 3D studio and preview before ordering. MOQ starts at just 10 pieces with doorstep delivery across India.",
      bestFor: [
        "Chocolate brands",
        "truffle businesses",
        "gifting hampers",
        "festive chocolate gifts",
        "mithai shops",
        "wedding favours",
      ],
      featureBullets: [
        "custom-size",
        "free-3d-studio",
        "moq-10",
        "food-safe",
        "doorstep-delivery",
        "shark-tank",
      ],
      imageUrls: [
        "https://cdn.shopify.com/s/files/1/0764/2274/2245/files/chocolate_bar_box_nail_buckles_tuck_end.ezpac.3d.jpg?v=1761737012",
      ],
      priceRupees: 10,
    },
  },
];

/**
 * Resolves the category placement for a mapped preset. Unmapped export rows are
 * intentionally left blank so an administrator chooses their category.
 */
export function ezpacMappingCategory(
  presetId?: EzpacPackagingProductTypeId,
): { primarySubcategoryId?: string; collectionIds: readonly string[] } | undefined {
  if (!presetId) return undefined;

  const preset = EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return undefined;

  return {
    primarySubcategoryId: preset.primarySubcategoryId,
    collectionIds: preset.collectionIds,
  };
}
