"use client";

import { useMemo, useState } from "react";
import { Check, Download, Mail, MessageCircle, Search, ShieldCheck, Star, Trash2, UserPlus } from "lucide-react";
import { customers, reviews as initialReviews, inr } from "./admin-data";
import { Card, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

export function CustomersPanel() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return customers.filter((customer) => [customer.name, customer.email, customer.segment].some((value) => value.toLowerCase().includes(needle)));
  }, [query]);

  return (
    <>
      <PageHeader
        actions={<><button className={styles.buttonSecondary} type="button"><Download size={14} /> Export</button><button className={styles.buttonPrimary} type="button"><UserPlus size={14} /> Add customer</button></>}
        description="Understand repeat buyers, keep contact details tidy, and support customers from one considerate workspace."
        eyebrow="Relationships"
        title="Customers"
      />
      <Card>
        <div className={styles.splitStats}>
          <div className={styles.splitStat}><span>Total customers</span><strong>1,284</strong></div>
          <div className={styles.splitStat}><span>Repeat customer rate</span><strong>31.8%</strong></div>
          <div className={styles.splitStat}><span>Average order value</span><strong>₹782</strong></div>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.localSearch}><span className={styles.srOnly}>Search customers</span><Search size={14} /><input className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or email" type="search" value={query} /></label>
          <select aria-label="Customer segment" className={styles.select}><option>All segments</option><option>New</option><option>Repeat</option><option>At risk</option></select>
          <span className={styles.resultCount}>{filtered.length} customers shown</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Customer</th><th>Segment</th><th>Orders</th><th>Total spent</th><th>Last order</th><th>Contact</th></tr></thead>
            <tbody>
              {filtered.map((customer, index) => (
                <tr key={customer.email}>
                  <td><div className={styles.customerCell}><span className={styles.avatar} data-color={["teal", "blue", "amber", "violet", "rose"][index % 5]}>{customer.initials}</span><span className={styles.cellStack}><strong>{customer.name}</strong><span>{customer.email}</span></span></div></td>
                  <td><StatusBadge tone={statusTone(customer.segment)}>{customer.segment}</StatusBadge></td>
                  <td>{customer.orders}</td><td><strong>{inr(customer.spend)}</strong></td><td>{customer.lastOrder}</td>
                  <td><div className={styles.inlineActions}><button aria-label={`Email ${customer.name}`} className={styles.iconButton} type="button"><Mail size={13} /></button><button aria-label={`Message ${customer.name}`} className={styles.iconButton} type="button"><MessageCircle size={13} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export function ReviewsPanel() {
  const [reviews, setReviews] = useState(initialReviews);

  function updateStatus(id: string, status: "Published" | "Removed") {
    setReviews((current) => status === "Removed" ? current.filter((review) => review.id !== id) : current.map((review) => review.id === id ? { ...review, status } : review));
  }

  return (
    <>
      <PageHeader
        actions={<button className={styles.buttonSecondary} type="button"><Download size={14} /> Export reviews</button>}
        description="Publish genuine product feedback, respond thoughtfully, and keep every displayed review traceable to a real order."
        eyebrow="Trust & feedback"
        title="Review moderation"
      />
      <Card>
        <div className={styles.splitStats}>
          <div className={styles.splitStat}><span>Published reviews</span><strong>248</strong></div>
          <div className={styles.splitStat}><span>Average rating</span><strong>4.8 / 5</strong></div>
          <div className={styles.splitStat}><span>Awaiting moderation</span><strong>{reviews.filter((review) => review.status === "Pending").length}</strong></div>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.localSearch}><span className={styles.srOnly}>Search reviews</span><Search size={14} /><input className={styles.input} placeholder="Search reviews or products" type="search" /></label>
          <select aria-label="Review status" className={styles.select}><option>All reviews</option><option>Pending</option><option>Published</option></select>
          <span className={styles.resultCount}>Verified purchases are labelled automatically</span>
        </div>
        <div className={styles.reviewList}>
          {reviews.map((review) => (
            <article className={styles.reviewItem} key={review.id}>
              <span className={styles.avatar}>{review.customer.split(" ").map((word) => word[0]).join("")}</span>
              <div className={styles.reviewBody}>
                <div className={styles.reviewMeta}>
                  <strong>{review.customer}</strong>
                  <span className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star fill={index < review.rating ? "currentColor" : "none"} key={index} size={10} />)}</span>
                  {review.verified && <span className={styles.verified}><ShieldCheck size={10} /> Verified purchase</span>}
                  <StatusBadge tone={statusTone(review.status)}>{review.status}</StatusBadge>
                </div>
                <p>{review.text}</p>
                <span className={styles.reviewProduct}>{review.product} · {review.date}</span>
              </div>
              <div className={styles.reviewActions}>
                {review.status === "Pending" && <button aria-label="Publish review" className={styles.iconButton} onClick={() => updateStatus(review.id, "Published")} type="button"><Check size={14} /></button>}
                <button aria-label="Remove review" className={styles.iconButton} onClick={() => updateStatus(review.id, "Removed")} type="button"><Trash2 size={13} /></button>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </>
  );
}
