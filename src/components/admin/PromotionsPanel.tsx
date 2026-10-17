"use client";

import { useState } from "react";
import { BadgePercent, Megaphone, Plus, Tags } from "lucide-react";
import { promotions as initialPromotions } from "./admin-data";
import { Card, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

export function PromotionsPanel() {
  const [promotions, setPromotions] = useState(initialPromotions);

  function togglePromotion(id: string) {
    setPromotions((current) => current.map((promotion) => promotion.id === id ? { ...promotion, status: promotion.status === "Active" ? "Paused" : "Active" } : promotion));
  }

  return (
    <>
      <PageHeader
        actions={<><button className={styles.buttonSecondary} type="button"><Megaphone size={14} /> Announcements</button><button className={styles.buttonPrimary} type="button"><Plus size={14} /> Create promotion</button></>}
        description="Run transparent, well-scoped offers with clear limits, eligibility, and redemption visibility."
        eyebrow="Growth"
        title="Promotions & coupons"
      />

      <div className={styles.promoGrid}>
        {promotions.map((promotion) => {
          const percentage = Math.min(100, Math.round((promotion.uses / promotion.limit) * 100));
          return (
            <Card className={styles.promoCard} key={promotion.id}>
              <div className={styles.promoAccent} />
              <div className={styles.promoBody}>
                <div className={styles.promoTop}>
                  <span className={styles.promoIcon}>{promotion.type === "Tiered" ? <Tags size={17} /> : <BadgePercent size={17} />}</span>
                  <StatusBadge tone={statusTone(promotion.status)}>{promotion.status}</StatusBadge>
                </div>
                <h3>{promotion.title}</h3>
                <span className={styles.promoCode}>{promotion.id}</span>
                <div className={styles.promoDetails}>
                  <div className={styles.promoDetail}><span>Offer</span><strong>{promotion.type}</strong></div>
                  <div className={styles.promoDetail}><span>Applies to</span><strong>{promotion.applies}</strong></div>
                  <div className={styles.promoDetail}><span>Ends</span><strong>{promotion.end}</strong></div>
                </div>
                <div className={styles.promoProgress}>
                  <div className={styles.promoProgressMeta}><span>{promotion.uses} redemptions</span><span>{promotion.limit} limit</span></div>
                  <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${percentage}%` }} /></div>
                </div>
                <div className={styles.promoFoot}>
                  <button className={styles.buttonSecondary} type="button">Edit</button>
                  <button className={styles.buttonGhost} onClick={() => togglePromotion(promotion.id)} type="button">{promotion.status === "Active" ? "Pause" : "Activate"}</button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
