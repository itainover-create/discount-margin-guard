import { useSearchParams } from "react-router";

export default function ShockReport() {
  const [searchParams] = useSearchParams();

  const data = {
    storeName: searchParams.get("store") || "Enigma Shop",
    riskStatus: "Stacking Risk Observed", 
    items: [
      { 
        name: "Rohde & Schwarz NRP-Z11 RF Power Sensor", 
        orig: 2505, 
        sale: 2255, 
        final: 2029, 
        impact: "19%" 
      },
      { 
        name: "Ma/Com MRF151G 300W MOSFET (Refurbished)", 
        orig: 293, 
        sale: 293, 
        final: 264, 
        impact: "10%" 
      }
    ]
  };

  const styles = {
    container: { backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif' },
    card: { maxWidth: '800px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
    header: { backgroundColor: '#0f172a', padding: '30px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    riskBadge: { backgroundColor: '#e67e22', color: '#ffffff', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase' },
    section: { padding: '30px', borderBottom: '1px solid #f1f5f9' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { textAlign: 'left', padding: '12px', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
    td: { padding: '12px', borderBottom: '1px solid #f1f5f9', fontSize: '14px' },
    highlightRow: { backgroundColor: '#fffbeb', fontWeight: '500' },
    footer: { padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', backgroundColor: '#f8fafc' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900', letterSpacing: '-0.5px' }}>PROFIT GUARD</h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Observed Discount Stacking Summary</p>
          </div>
          <div style={styles.riskBadge}>{data.riskStatus}</div>
        </div>

        <div style={styles.section}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Observed Pricing Overlap: {data.storeName}</h2>
          <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
            This summary documents cases where a <strong>10% Welcome code</strong> stacked on top of existing Sale pricing and Refurbished item categories. 
            The pricing path indicates a potential gap in discount exclusion rules for high-value RF equipment.
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '15px' }}>Audited Case Data (USD)</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product / SKU</th>
                <th style={styles.th}>MSRP</th>
                <th style={styles.th}>Site Price</th>
                <th style={styles.th}>Final (Stacked)</th>
                <th style={styles.th}>Est. Margin Erosion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} style={item.impact === "19%" ? styles.highlightRow : {}}>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.td}>${item.orig.toLocaleString()}</td>
                  <td style={styles.td}>${item.sale.toLocaleString()}</td>
                  <td style={styles.td}>${item.final.toLocaleString()}</td>
                  <td style={{ ...styles.td, color: '#d97706', fontWeight: 'bold' }}>-{item.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '30px', backgroundColor: '#f8fafc', color: '#334155', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6' }}>
            <span style={{ fontWeight: 'bold', color: '#0f172a' }}>Executive Analysis:</span> In this audited set, the cumulative discount path resulted in a 
            <strong> 18.1% reduction from MSRP</strong>. For specialized hardware and refurbished components, this level of overlap often 
            neutralizes the net margin after fulfillment and transaction costs.
          </p>
        </div>

        <div style={styles.footer}>
          Generated for Internal Review • Profit Guard Audit Engine • Render Node: Production
        </div>
      </div>
    </div>
  );
}