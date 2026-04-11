import { useSearchParams } from "react-router";

export default function ShockReport() {
  const [searchParams] = useSearchParams();

  const data = {
    storeName: searchParams.get("store") || "Wisetek Market",
    riskStatus: "CRITICAL: ASSET DEVALUATION", 
    items: [
      { name: "HP Pavilion Plus 14 (Core Ultra 5)", orig: 884.61, sale: 530.77, final: 477.69, impact: "46%" },
      { name: "HP OmniBook X Copilot+ PC", orig: 674.03, sale: 404.00, final: 363.60, impact: "46%" },
      { name: "Samsung GalaxyBook 2 (Touch i7)", orig: 605.68, sale: 363.41, final: 327.07, impact: "46%" }
    ]
  };

  const styles = {
    container: { backgroundColor: '#f8fafc', minHeight: '100vh', padding: '40px 20px', fontFamily: 'Inter, sans-serif' },
    card: { maxWidth: '850px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' },
    header: { backgroundColor: '#1e293b', padding: '25px 40px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    riskBadge: { backgroundColor: '#ef4444', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' },
    section: { padding: '40px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { textAlign: 'left', padding: '15px', borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
    td: { padding: '15px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#334155' },
    impactCell: { color: '#dc2626', fontWeight: 'bold' },
    footer: { padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', borderTop: '1px solid #f1f5f9' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>PROFIT GUARD | <span style={{fontWeight: '400', color: '#94a3b8'}}>AUDIT</span></h1>
          </div>
          <div style={styles.riskBadge}>{data.riskStatus}</div>
        </div>

        <div style={styles.section}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>E-commerce Margin Leak: {data.storeName}</h2>
          <p style={{ color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
            Documented system failure where <strong>manual coupon codes</strong> bypass the 40% automatic discount threshold. 
            This results in an effective <strong>46% reduction from MSRP</strong> across premium refurbished inventory.
          </p>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>High-Value Asset</th>
                <th style={styles.th}>List Price</th>
                <th style={styles.th}>Auto Discount</th>
                <th style={styles.th}>Final (Stacked)</th>
                <th style={styles.th}>Total Erosion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx}>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.td}>${item.orig.toFixed(2)}</td>
                  <td style={styles.td}>${item.sale.toFixed(2)}</td>
                  <td style={styles.td}>${item.final.toFixed(2)}</td>
                  <td style={{ ...styles.td, ...styles.impactCell }}>-{item.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '30px', backgroundColor: '#fff1f2', borderTop: '1px solid #fecaca' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#991b1b', lineHeight: '1.5' }}>
            <strong>Financial Impact:</strong> In ITAD and refurbished retail, selling at 46% below calculated MSRP often falls below the Net Recovery Value (NRV). Cumulative stacking on a $1,298 cart resulted in an additional <strong>$129.80 loss of margin</strong> that should have been restricted by the Shopify discount engine.
          </p>
        </div>
        <div style={styles.footer}>Wisetek Global Audit • Confidential Technical Report • Render Build: v2.4.1</div>
      </div>
    </div>
  );
}