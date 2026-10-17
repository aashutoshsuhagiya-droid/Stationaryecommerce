import { CalendarDays, Download, Package, Repeat2, ShoppingCart, TrendingUp } from "lucide-react";
import { Card, CardHeader, MetricCard, PageHeader } from "./AdminUI";
import { inr, products } from "./admin-data";
import styles from "./admin.module.css";

const channels = [
  { name: "Direct & returning", value: 42, color: "#168c80" },
  { name: "Search", value: 26, color: "#4b77a1" },
  { name: "Social", value: 16, color: "#f4b942" },
  { name: "Other", value: 16, color: "#b6c8c8" },
];

export function ReportsPanel() {
  return (
    <>
      <PageHeader
        actions={<><button className={styles.buttonSecondary} type="button"><CalendarDays size={14} /> 1–17 October</button><button className={styles.buttonPrimary} type="button"><Download size={14} /> Export report</button></>}
        description="See what is selling, where customers return, and which operational choices are improving healthy growth."
        eyebrow="Store intelligence"
        title="Reports"
      />

      <div className={styles.metricsGrid}>
        <MetricCard change="14.2%" context="vs. prior period" icon={TrendingUp} label="Gross sales" value="₹1,42,860" />
        <MetricCard change="9.6%" context="vs. prior period" icon={ShoppingCart} label="Orders" value="184" />
        <MetricCard change="₹34" context="vs. prior period" icon={Package} label="Average order value" value="₹776" />
        <MetricCard change="3.8 pts" context="vs. prior period" icon={Repeat2} label="Repeat customer rate" value="31.8%" />
      </div>

      <div className={styles.reportGrid}>
        <Card>
          <CardHeader action={<span className={styles.trendUp}>+14.2%</span>} caption="Revenue after discounts, before refunds" title="Net sales over time" />
          <div className={styles.cardBody}>
            <div className={styles.chartMeta}>
              <div className={styles.chartTotal}><strong>₹1,37,420</strong><span>17-day net sales</span></div>
              <div className={styles.chartLegend}><span className={styles.legendItem}><i className={styles.legendDot} /> This period</span><span className={styles.legendItem}><i className={styles.legendDotMuted} /> Previous period</span></div>
            </div>
            <div aria-label="Net sales line chart trending upward" className={styles.lineChart} role="img">
              <svg preserveAspectRatio="none" viewBox="0 0 800 240">
                <defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#168c80" stopOpacity=".2" /><stop offset="1" stopColor="#168c80" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 198 C70 186 95 175 135 181 S210 148 255 157 S330 127 380 139 S450 112 495 121 S565 85 610 97 S675 54 720 67 S770 34 800 42 L800 240 L0 240 Z" fill="url(#salesFill)" />
                <path d="M0 198 C70 186 95 175 135 181 S210 148 255 157 S330 127 380 139 S450 112 495 121 S565 85 610 97 S675 54 720 67 S770 34 800 42" fill="none" stroke="#168c80" strokeLinecap="round" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                <path d="M0 205 C90 197 110 191 160 194 S240 177 290 182 S380 151 430 160 S520 138 580 144 S680 112 740 125 S780 106 800 110" fill="none" stroke="#d6e2e1" strokeDasharray="7 7" strokeLinecap="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className={styles.chartAxis}><span>1 Oct</span><span>3 Oct</span><span>6 Oct</span><span>9 Oct</span><span>12 Oct</span><span>15 Oct</span><span>17 Oct</span></div>
          </div>
        </Card>

        <Card>
          <CardHeader caption="Share of attributed sessions" title="Customer discovery" />
          <div className={styles.cardBody}>
            <div className={styles.donutWrap}><div className={styles.donut}><strong>3,842</strong><span>sessions</span></div></div>
            <div className={styles.channelLegend}>
              {channels.map((channel) => <div className={styles.channelRow} key={channel.name}><span className={styles.channelName}><i className={styles.channelSwatch} style={{ background: channel.color }} />{channel.name}</span><strong>{channel.value}%</strong></div>)}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader caption="Ranked by fulfilled order value" title="Top products" />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th><th>Share of sales</th><th>Trend</th></tr></thead>
            <tbody>
              {products.slice(0, 5).map((product, index) => (
                <tr key={product.id}>
                  <td><div className={styles.productNameCell}><span className={styles.productThumb} data-art={product.art} /><span className={styles.cellStack}><strong>{product.name}</strong><span>{product.category}</span></span></div></td>
                  <td>{product.orders}</td><td><strong>{inr(product.orders * product.price)}</strong></td><td>{[28, 23, 18, 14, 11][index]}%</td><td><span className={styles.trendUp}>+{[16, 12, 9, 7, 4][index]}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className={styles.insightGrid} style={{ marginTop: 18 }}>
        <Card className={styles.insightCard}><div className={styles.insightTop}><span className={styles.insightIcon}><TrendingUp size={15} /></span><h3>Repeat buyers are growing</h3></div><p>Customers placing a second order increased compared with the previous period.</p></Card>
        <Card className={styles.insightCard}><div className={styles.insightTop}><span className={styles.insightIcon}><Package size={15} /></span><h3>Combos lift order value</h3></div><p>School Essentials Combo contributes the strongest basket value in this period.</p></Card>
        <Card className={styles.insightCard}><div className={styles.insightTop}><span className={styles.insightIcon}><Repeat2 size={15} /></span><h3>Watch label inventory</h3></div><p>Two popular label formats are approaching their configured low-stock threshold.</p></Card>
      </div>
    </>
  );
}
