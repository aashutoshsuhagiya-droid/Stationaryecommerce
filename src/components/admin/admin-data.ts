export type AdminOrder = {
  id: string;
  customer: string;
  initials: string;
  email: string;
  product: string;
  detail: string;
  total: number;
  payment: "Paid" | "Pending" | "Refunded";
  status:
    | "New"
    | "Artwork review"
    | "In production"
    | "Quality check"
    | "Ready to ship"
    | "Shipped";
  placed: string;
  due: string;
  color: "teal" | "blue" | "amber" | "violet" | "rose";
};

export const orders: AdminOrder[] = [
  {
    id: "NM-10482",
    customer: "Aarav Mehta",
    initials: "AM",
    email: "aarav@example.com",
    product: "Waterproof Name Labels",
    detail: "Dino Trails · Pack of 48 · Aarav",
    total: 649,
    payment: "Paid",
    status: "Artwork review",
    placed: "Today, 10:42 AM",
    due: "18 Oct",
    color: "teal",
  },
  {
    id: "NM-10481",
    customer: "Sana Khan",
    initials: "SK",
    email: "sana@example.com",
    product: "School Essentials Combo",
    detail: "Space Club · 2 children · 96 labels",
    total: 1299,
    payment: "Paid",
    status: "In production",
    placed: "Today, 9:18 AM",
    due: "18 Oct",
    color: "violet",
  },
  {
    id: "NM-10478",
    customer: "Meera Iyer",
    initials: "MI",
    email: "meera@example.com",
    product: "Personalized Pencils",
    detail: "Sunshine Yellow · Pack of 12 · Meera",
    total: 399,
    payment: "Paid",
    status: "Quality check",
    placed: "Yesterday, 5:06 PM",
    due: "Today",
    color: "amber",
  },
  {
    id: "NM-10475",
    customer: "Kabir Shah",
    initials: "KS",
    email: "kabir@example.com",
    product: "Bottle & Tiffin Labels",
    detail: "Ocean Friends · Pack of 24 · Kabir",
    total: 549,
    payment: "Pending",
    status: "New",
    placed: "Yesterday, 2:31 PM",
    due: "19 Oct",
    color: "blue",
  },
  {
    id: "NM-10471",
    customer: "Ananya Rao",
    initials: "AR",
    email: "ananya@example.com",
    product: "Premium Name Slips",
    detail: "Botanical · Pack of 72 · Ananya",
    total: 899,
    payment: "Paid",
    status: "Ready to ship",
    placed: "16 Oct, 11:24 AM",
    due: "Today",
    color: "rose",
  },
  {
    id: "NM-10468",
    customer: "Vihaan Patel",
    initials: "VP",
    email: "vihaan@example.com",
    product: "Personalized Notebook",
    detail: "Little Explorer · A5 ruled · Vihaan",
    total: 475,
    payment: "Paid",
    status: "Shipped",
    placed: "15 Oct, 4:48 PM",
    due: "Dispatched",
    color: "teal",
  },
];

export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  sku: string;
  price: number;
  stock: number;
  orders: number;
  status: "Active" | "Draft" | "Archived" | "Low stock";
  personalized: boolean;
  art: "labels" | "pencils" | "notebook" | "bottle" | "combo";
  imageUrl?: string;
  has3DTemplate?: boolean;
};

export const products: AdminProduct[] = [
  { id: "p1", name: "Waterproof Name Labels", category: "Name labels", sku: "NL-WP-048", price: 649, stock: 86, orders: 142, status: "Active", personalized: true, art: "labels" },
  { id: "p2", name: "School Essentials Combo", category: "Value packs", sku: "VP-SE-096", price: 1299, stock: 18, orders: 98, status: "Low stock", personalized: true, art: "combo" },
  { id: "p3", name: "Personalized Pencils", category: "Stationery", sku: "ST-PP-012", price: 399, stock: 124, orders: 76, status: "Active", personalized: true, art: "pencils" },
  { id: "p4", name: "Little Explorer Notebook", category: "Notebooks", sku: "NB-LE-A5", price: 475, stock: 52, orders: 61, status: "Active", personalized: true, art: "notebook" },
  { id: "p5", name: "Bottle & Tiffin Label Set", category: "Name labels", sku: "NL-BT-024", price: 549, stock: 9, orders: 54, status: "Low stock", personalized: true, art: "bottle" },
  { id: "p6", name: "Classic School Name Slips", category: "Name slips", sku: "NS-CL-072", price: 299, stock: 0, orders: 31, status: "Draft", personalized: true, art: "labels" },
];

export const templates = [
  { id: "dino", name: "Dino Trails", collection: "Animals", products: 4, uses: 128, status: "Live", bg: "mint" },
  { id: "space", name: "Space Club", collection: "Adventure", products: 5, uses: 96, status: "Live", bg: "navy" },
  { id: "botanical", name: "Soft Botanical", collection: "Nature", products: 3, uses: 84, status: "Live", bg: "peach" },
  { id: "ocean", name: "Ocean Friends", collection: "Animals", products: 4, uses: 72, status: "Live", bg: "sky" },
  { id: "geometric", name: "Bright Geometry", collection: "Classic", products: 2, uses: 46, status: "Draft", bg: "yellow" },
  { id: "sport", name: "Game On", collection: "Sports", products: 2, uses: 33, status: "Live", bg: "lime" },
] as const;

export const customers = [
  { name: "Sana Khan", initials: "SK", email: "sana@example.com", orders: 6, spend: 5834, lastOrder: "Today", segment: "Repeat" },
  { name: "Aarav Mehta", initials: "AM", email: "aarav@example.com", orders: 3, spend: 2447, lastOrder: "Today", segment: "Repeat" },
  { name: "Meera Iyer", initials: "MI", email: "meera@example.com", orders: 1, spend: 399, lastOrder: "Yesterday", segment: "New" },
  { name: "Ananya Rao", initials: "AR", email: "ananya@example.com", orders: 4, spend: 3126, lastOrder: "16 Oct", segment: "Repeat" },
  { name: "Rohan Das", initials: "RD", email: "rohan@example.com", orders: 2, spend: 1698, lastOrder: "14 Oct", segment: "At risk" },
];

export const reviews = [
  { id: "r1", customer: "Nisha Verma", product: "Waterproof Name Labels", rating: 5, text: "The preview matched exactly and the labels have survived several washes already.", date: "17 Oct", status: "Published", verified: true },
  { id: "r2", customer: "Dev Malhotra", product: "School Essentials Combo", rating: 4, text: "Beautiful set and very neatly packed. Would love one more font option.", date: "16 Oct", status: "Pending", verified: true },
  { id: "r3", customer: "Kavya Joshi", product: "Personalized Pencils", rating: 5, text: "My daughter loved seeing her name on every pencil. Lovely print quality.", date: "15 Oct", status: "Published", verified: true },
];

export const promotions = [
  { id: "BACKTOSCHOOL", title: "Back to school bundle", type: "10% off", applies: "School combos", uses: 84, limit: 150, status: "Active", end: "31 Oct 2026" },
  { id: "FIRSTORDER", title: "First order welcome", type: "₹100 off", applies: "Orders above ₹799", uses: 126, limit: 500, status: "Active", end: "No end date" },
  { id: "BULK25", title: "Institutional packs", type: "Tiered", applies: "Bulk orders", uses: 18, limit: 50, status: "Scheduled", end: "15 Nov 2026" },
];

export function inr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
