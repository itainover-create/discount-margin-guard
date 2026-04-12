import { useSearchParams } from "react-router";

export default function ForensicAuditReport() {
  const [searchParams] = useSearchParams();

  const storeName = searchParams.get("store") || "Target Store";
  
  // נתונים לדוגמה שניתן להעביר ב-URL (מומלץ להעביר לפחות 2 מוצרים)
  const evidenceData = [
    { 
      name: searchParams.get("p1_name") || "Samsung GalaxyBook 2", 
      msrp: parseFloat(searchParams.get("p1_msrp")) || 605.68,
      site: parseFloat(searchParams.get("p1_site")) || 363.41,
      final: parseFloat(searchParams.get("p1_final")) || 327.07
    },
    { 
      name: searchParams.get("p2_name") || "HP Pavilion Plus 14", 
      msrp: parseFloat(searchParams.get("p2_msrp")) || 884.61,
      site: parseFloat(searchParams.get("p2_site")) || 530.77,
      final: parseFloat(searchParams.get("p2_final")) || 477.69
    }
  ];

  const unitLeak = evidenceData[0].site - evidenceData[0].final;

  const styles = {
    container: { backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '60px 20px', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b' },
    card: { maxWidth: '900px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', overflow: 'hidden', border: '1px solid #e2e8f0' },
    header: { backgroundColor: '#0f172a', padding: '30px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #dc2626' },
    severityBadge: { backgroundColor: '#dc2626', color: 'white', padding: '10px 20px', borderRadius: '6px', fontSize: '16px', fontWeight: '900', textTransform: 'uppercase' },
    section: { padding: '50px 60px' },
    confidenceBox: { backgroundColor: '#f8fafc', border: '2px solid #e2e8f0', padding: '24px', borderRadius: '12px', marginBottom: '40px', fontSize: '15px', color: '#475569', lineHeight: '1.6' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px', marginBottom: '40px' },
    th: { textAlign: 'left', padding: '12px 15px', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: '700' },
    td: { padding: '15px', borderBottom: '1px solid #f1f5f9', fontSize: '14px' },
    discountCell: { color: '#dc2626', fontWeight: '800' },
    scenarioBox: { border: '2px solid #fee2e2', borderRadius: '12px', overflow: 'hidden', marginTop: '40px' },
    scenarioHeader: { backgroundColor: '#fef2f2', padding: '15px 25px', fontWeight: '800', color: '#991b1b', fontSize: '16px' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '20px', fontWeight: '800' }}>
            PROFIT GUARD <span style={{opacity: 0.5}}>| FORENSIC AUDIT</span>
          </h1>
          <div style={styles.severityBadge}>CRITICAL: HIGH STACKING RISK</div>
        </div>

        <div style={styles.section}>
          <div style={styles.confidenceBox}>
            <strong style={{ display: 'block', color: '#0f172a', textTransform: 'uppercase', fontSize: '12px', marginBottom: '4px' }}>Confidence Framing</strong>
            Observed externally. Analysis based on captured storefront logic and specific SKU checkout behavior. No internal financial access required.
          </div>

          <h2 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '30px' }}>
            Evidence Capture: <span style={{color: '#2563eb'}}>{storeName}</span>
          </h2>

          {/* Forensic Evidence Table */}
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product (Short Name)</th>
                <th style={styles.th}>MSRP</th>
                <th style={styles.th}>Site Price</th>
                <th style={styles.th}>Final Price</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Effective Discount</th>
              </tr>
            </thead>
            <tbody>
              {evidenceData.map((item, i) => {
                const effectiveDiscount = ((1 - (item.final / item.msrp)) * 100).toFixed(1);
                return (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontWeight: '700' }}>{item.name}</td>
                    <td style={styles.td}>${item.msrp.toFixed(2)}</td>
                    <td style={styles.td}>${item.site.toFixed(2)}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: '#0f172a' }}>${item.final.toFixed(2)}</td>
                    <td style={{ ...styles.td, ...styles.discountCell, textAlign: 'right' }}>{effectiveDiscount}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ backgroundColor: '#f0f9ff', padding: '24px', borderRadius: '12px', borderLeft: '6px solid #0ea5e9' }}>
            <span style={{ fontSize: '13px', color: '#0369a1', fontWeight: '800', textTransform: 'uppercase' }}>Avg. Captured Margin Leakage</span>
            <div style={{ fontSize: '48px', fontWeight: '900', color: '#0c4a6e' }}>${unitLeak.toFixed(2)} <span style={{fontSize: '18px', fontWeight: '400', opacity: 0.7}}>per cart</span></div>
          </div>

          <div style={styles.scenarioBox}>
            <div style={styles.scenarioHeader}>Exposure Scaling Scenarios</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[10, 50, 100].map(qty => (
                  <tr key={qty}>
                    <td style={{ ...styles.td, paddingLeft: '25px' }}>{qty} Sample Orders</td>
                    <td style={{ ...styles.td, textAlign: 'right', paddingRight: '25px', fontWeight: '800', color: '#b91c1c', fontSize: '18px' }}>
                      -${(qty * unitLeak).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
          Full product titles and checkout screenshots available on request.
        </div>
      </div>
    </div>
  );
}