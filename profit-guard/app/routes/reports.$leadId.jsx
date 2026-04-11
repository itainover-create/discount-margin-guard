import { useSearchParams } from "react-router";

export default function ShockReport() {
  const [searchParams] = useSearchParams();

  const data = {
    storeName: searchParams.get("store") || "Wisetek Market",
    riskStatus: "STACKING RISK OBSERVED", 
    items: [
      { 
        name: "HP Pavilion Plus 14 (Core Ultra 5)", 
        msrp: 884.61, 
        autoPrice: 530.77, 
        final: 477.69, 
        effective: "46%" 
      },
      { 
        name: "HP OmniBook X Copilot+ PC", 
        msrp: 674.03, 
        autoPrice: 404.00, 
        final: 363.60, 
        effective: "46%" 
      },
      { 
        name: "Samsung GalaxyBook 2 (Touch i7)", 
        msrp: 605.68, 
        autoPrice: 363.41, 
        final: 327.07, 
        effective: "46%" 
      }
    ],
    summary: {
      totalMsrp: 2164.32,
      afterAuto: 1298.60,
      afterCode: 1168.74,
      additionalSaving: 129.86
    }
  };

  const styles = {
    container: { backgroundColor: '#f8fafc', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif', color: '#1e293b' },
    card: { maxWidth: '850px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' },
    header: { backgroundColor: '#0f172a', padding: '25px 40px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    riskBadge: { backgroundColor: '#f59e0b', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' },
    section: { padding: '40px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { textAlign: 'left', padding: '15px', borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
    td: { padding: '15px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#334155' },
    footerBox: { padding: '30px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', color: '#475569', fontSize: '14px', lineHeight: '1.6' },
    brandFooter: { padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', letterSpacing: '0.5px' }}>
              PROFIT GUARD | <span style={{fontWeight: '400', color: '#94a3b8'}}>OBSERVED DISCOUNT STACKING SUMMARY</span>
            </h1>
          </div>
          <div style={styles.riskBadge}>{data.riskStatus}</div>
        </div>

        <div style={styles.section}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '15px' }}>
            Observed Discount Stacking: {data.storeName}
          </h2>
          <p style={{ color: '#475569', fontSize: '16px', lineHeight: '1.6', margin: 0 }}>
            This summary documents a checkout case where a <strong>10% cart code</strong> was accepted on top of existing 40% automatic discounts across multiple refurbished laptop items. The observed pricing path brought the effective total discount to about <strong>46% versus MSRP</strong>.
          </p>

          <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginTop: '30px', marginBottom: '10px' }}>
            Captured Checkout Example
          </h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>MSRP</th>
                <th style={styles.th}>Auto-Discount Price</th>
                <th style={styles.th}>Final Price (After Code)</th>
                <th style={styles.th}>Effective Discount vs MSRP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx}>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.td}>${item.msrp.toFixed(2)}</td>
                  <td style={styles.td}>${item.autoPrice.toFixed(2)}</td>
                  <td style={styles.td}>${item.final.toFixed(2)}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold', color: '#0f172a' }}>-{item.effective}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.footerBox}>
          <strong>Summary:</strong> On refurbished electronics, this level of overlap can materially erode margin and suggests a potential gap in discount exclusion logic. In the captured cart, the additional code reduced the already discounted subtotal by <strong>${data.summary.additionalSaving.toFixed(2)}</strong>.
        </div>

        <div style={styles.brandFooter}>
          Internal Review Document • Profit Guard Audit Engine • Render Node: Production
        </div>
      </div>
    </div>
  );
}