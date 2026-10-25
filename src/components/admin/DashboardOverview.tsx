import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  Paintbrush,
  ShoppingBag,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { orders, inr } from "./admin-data";
import { Card, CardHeader, MetricCard, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

const chart = [
  { day: "Mon", current: 52, previous: 36 },
  { day: "Tue", current: 68, previous: 45 },
  { day: "Wed", current: 61, previous: 50 },
  { day: "Thu", current: 83, previous: 58 },
  { day: "Fri", current: 72, previous: 65 },
  { day: "Sat", current: 94, previous: 69 },
  { day: "Sun", current: 78, previous: 62 },
];

const activities = [
  { icon: ShoppingBag, copy: <><strong>New order NM-10482</strong> was placed by Aarav Mehta.</>, time: "8 minutes ago" },
  { icon: Paintbrush, copy: <>Artwork for <strong>NM-10481</strong> moved to production.</>, time: "36 minutes ago" },
  { icon: UserPlus, copy: <><strong>Meera Iyer</strong> joined after her first purchase.</>, time: "1 hour ago" },
  { icon: CheckCircle2, copy: <>Quality check approved for <strong>NM-10478</strong>.</>, time: "2 hours ago" },
];

export function DashboardOverview() {
  return (
    <>
      <PageHeader
        actions={
          <>
            <Link className={styles.buttonSecondary} href="/admin/reports">View reports</Link>
            <Link className={styles.buttonPrimary} href="/admin/orders">Manage orders <ArrowRight size={14} /></Link>
          </>
        }
        description="A seeded preview of sales, production, and customer workflows. Values become operational only after the database adapter is connected."
        eyebrow="Demo snapshot"
        title="Store overview"
      />

      <div className={styles.metricsGrid}>
        <MetricCard change="12.4%" context="vs. previous week" icon={CircleDollarSign} label="Net sales" value="₹48,620" />
        <MetricCard change="8.7%" context="vs. previous week" icon={ShoppingBag} label="Orders" value="84" />
        <MetricCard change="4 orders" context="need artwork approval" icon={Clock3} label="Awaiting review" trend="neutral" value="12" />
        <MetricCard change="2 items" context="need restocking" icon={PackageCheck} label="Ready to dispatch" value="9" />
      </div>

      <div className={styles.dashboardGrid}>
        <Card>
          <CardHeader
            action={<button className={styles.buttonGhost} type="button">Last 7 days</button>}
            caption="Seeded paid-order examples"
            title="Revenue trend"
          />
          <div className={styles.cardBody}>
            <div className={styles.chartMeta}>
              <div className={styles.chartTotal}>
                <strong>₹48,620</strong>
                <span>₹6,946 average per day</span>
              </div>
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}><i className={styles.legendDot} /> This week</span>
                <span className={styles.legendItem}><i className={styles.legendDotMuted} /> Previous</span>
              </div>
            </div>
            <div aria-label="Weekly revenue bar chart" className={styles.barChart} role="img">
              {chart.map((item) => (
                <div className={styles.barGroup} key={item.day} title={`${item.day}: ₹${item.current * 100}`}>
                  <span className={styles.barPrevious} style={{ height: `${item.previous}%` }} />
                  <span className={styles.barCurrent} style={{ height: `${item.current}%` }} />
                </div>
              ))}
            </div>
            <div className={styles.chartAxis}>{chart.map((item) => <span key={item.day}>{item.day}</span>)}</div>
          </div>
        </Card>

        <Card>
          <CardHeader caption="28 open orders" title="Fulfillment health" />
          <div className={styles.cardBody}>
            <div className={styles.fulfillmentList}>
              {[
                ["Artwork review", 6, 21],
                ["In production", 8, 29],
                ["Quality check", 5, 18],
                ["Ready to ship", 9, 32],
              ].map(([label, count, percentage]) => (
                <div className={styles.fulfillmentRow} key={label}>
                  <div className={styles.fulfillmentMeta}><span>{label}</span><span>{count} orders</span></div>
                  <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${percentage}%` }} /></div>
                </div>
              ))}
            </div>
            <div className={styles.fulfillmentNote}>
              <AlertTriangle size={15} />
              <span><strong>2 orders are due today.</strong><br />Prioritise quality checks before the 4 PM pickup.</span>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.bottomGrid}>
        <Card>
          <CardHeader
            action={<Link className={styles.buttonGhost} href="/admin/orders">View all <ArrowRight size={12} /></Link>}
            caption="Latest activity across the store"
            title="Recent orders"
          />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td><Link className={styles.orderId} href="/admin/orders">{order.id}</Link><div className={styles.cellStack}><span>{order.placed}</span></div></td>
                    <td>
                      <div className={styles.customerCell}>
                        <span className={styles.avatar} data-color={order.color}>{order.initials}</span>
                        <span className={styles.cellStack}><strong>{order.customer}</strong><span>{order.product}</span></span>
                      </div>
                    </td>
                    <td><StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge></td>
                    <td><strong>{inr(order.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader action={<Sparkles color="var(--text-heading)" size={15} />} caption="From today" title="Store activity" />
          <div className={styles.cardBody}>
            <div className={styles.activityList}>
              {activities.map((activity, index) => {
                const Icon = activity.icon;
                return (
                  <div className={styles.activityItem} key={index}>
                    <span className={styles.activityIcon}><Icon size={13} /></span>
                    <div className={styles.activityCopy}><p>{activity.copy}</p><span>{activity.time}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
