import { useSearchParams } from "react-router";

export default function ShockReport() {
  const [searchParams] = useSearchParams();

  // נתונים שהופקו מהאודיט הידני שביצעת ב-Jasco
  const data = {
    storeName: searchParams.get("store") || "Jasco Products",
    riskStatus: "High Stacking Risk", 
    items: [
      { 
        name: "Enbrighten Ecoscapes WiFi LED Lights (2 pack)", 
        orig: 169.99, 
        sale: 99.99, 
        final: 84.99, 
        impact: "50%" 
      },
      { 
        name: "Philips USB-C Travel Docking Station", 
        orig: 79.90, 
        sale: 64.99, 
        final: 55.24, 
        impact: "31%" 
      },
      { 
        name: "Enbrighten WiFi VIBE LED Cafe Lights (96ft)", 
        orig: 104.99, 
        sale: 99.99, 
        final: 84.99, 
        impact: "19%" 
      }
    ]
  };

  const styles = {
    container: { backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif', color: '#1e293b' },
    card: { maxWidth: '800px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
    header: { backgroundColor: '#0f172a', padding: '30px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    riskBadge: { backgroundColor: '#dc2626', color: '#ffffff', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase' },
    section: { padding: '30px', borderBottom: '1px solid #f1f5f9' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { textAlign: 'left', padding: '12px', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
    td: { padding: '12px', borderBottom: '1px solid #f1f5f9', fontSize: '14px' },
    highlightRow: { backgroundColor: '#fff1f2', fontWeight: '600' },
    analysisBox: { padding: '30px', backgroundColor: '#fff1f2', color: '#991b1b', borderTop: '1px solid #fecaca' },
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
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Audit Findings: {data.storeName}</h2>
          <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
            This audit documents cases where a <strong>15% First-Purchase code</strong> stacks with existing Clearance and Sale pricing. 
            The current exclusion logic fails to prevent cumulative discounts on high-ticket electronics.
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '15px' }}>Audited Transaction Data (USD)</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product / SKU</th>
                <th style={styles.th}>MSRP</th>
                <th style={styles.th}>Site Price</th>
                <th style={styles.th}>Final (Stacked)</th>
                <th style={styles.th}>Total Erosion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} style={item.impact === "50%" ? styles.highlightRow : {}}>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.td}>${item.orig.toFixed(2)}</td>
                  <td style={styles.td}>${item.sale.toFixed(2)}</td>
                  <td style={styles.td}>${item.final.toFixed(2)}</td>
                  <td style={{ ...styles.td, color: item.impact === "50%" ? '#be123c' : '#d97706', fontWeight: 'bold' }}>-{item.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.analysisBox}>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
            <span style={{ fontWeight: 'bold' }}>Executive Analysis:</span> Cumulative discounts on the Enbrighten 2-pack reached 
            <strong> 50.0% from MSRP</strong>. For a direct-to-consumer electronics operation, this level of overlap typically 
            neutralizes net profit margins and can lead to orders being fulfilled below landed cost.
          </p>
        </div>

        <div style={styles.footer}>
          Internal Review Document • Profit Guard Audit Engine • Render Node: Production
        </div>
      </div>
    </div>
  );
}