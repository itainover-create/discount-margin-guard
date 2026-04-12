import { useSearchParams } from "react-router";

export default function ShockReport() {
  const [searchParams] = useSearchParams();

  const storeName = searchParams.get("store") || "Target Store";
  const unitLeak = parseFloat(searchParams.get("leak")) || 129.86; 

  const data = {
    severity: "CRITICAL: HIGH STACKING RISK",
    confidence: "OBSERVED EXTERNALLY: Analysis based on captured storefront logic and checkout behavior. No internal financial access required.",
    observations: [
      "Existing automatic markdown detected on premium inventory",
      "Additional manual coupon code accepted on top of markdowns",
      "Cumulative effective discount exceeds target margin thresholds"
    ]
  };

  const styles = {
    container: { backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '60px 20px', fontFamily: 'Inter, system-ui, sans-serif' },
    card: { maxWidth: '850px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', overflow: 'hidden', border: '1px solid #e2e8f0' },
    header: { backgroundColor: '#0f172a', padding: '30px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #dc2626' },
    // הגדלת הבאג' של רמת הסיכון
    severityBadge: { backgroundColor: '#dc2626', color: 'white', padding: '12px 24px', borderRadius: '8px', fontSize: '18px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase' },
    section: { padding: '50px 60px' },
    // שיפור משמעותי לקריאות של ה-Confidence Framing
    confidenceBox: { backgroundColor: '#f8fafc', border: '2px solid #e2e8f0', padding: '24px', borderRadius: '12px', marginBottom: '40px', fontSize: '16px', color: '#475569', lineHeight: '1.6', fontWeight: '500' },
    leakHero: { backgroundColor: '#f0f9ff', padding: '32px', borderRadius: '12px', borderLeft: '8px solid #0ea5e9', marginBottom: '40px' },
    scenarioBox: { border: '2px solid #fee2e2', borderRadius: '12px', overflow: 'hidden', marginTop: '40px' },
    scenarioHeader: { backgroundColor: '#fef2f2', padding: '20px 25px', fontWeight: '800', color: '#991b1b', fontSize: '18px', borderBottom: '2px solid #fee2e2' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '15px 25px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px', textTransform: 'uppercase', fontWeight: '700' },
    td: { padding: '20px 25px', borderBottom: '1px solid #f1f5f9', fontSize: '16px', color: '#1e293b' },
    footer: { padding: '25px', textAlign: 'center', backgroundColor: '#f8fafc', color: '#94a3b8', fontSize: '14px', borderTop: '1px solid #e2e8f0', fontWeight: '500' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '22px', fontWeight: '800', letterSpacing: '0.5px' }}>
            PROFIT GUARD <span style={{fontWeight: '300', opacity: 0.6}}>| AUDIT REPORT</span>
          </h1>
          <div style={styles.severityBadge}>{data.severity}</div>
        </div>

        <div style={styles.section}>
          <div style={styles.confidenceBox}>
            <span style={{ color: '#0f172a', fontWeight: '800', display: 'block', marginBottom: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Confidence Framing
            </span>
            {data.confidence}
          </div>

          <h2 style={{ fontSize: '32px', fontWeight: '900', marginBottom: '24px', color: '#0f172a', lineHeight: '1.2' }}>
            Pricing Overlap Observed: <span style={{color: '#2563eb'}}>{storeName}</span>
          </h2>
          
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '700', letterSpacing: '1px' }}>
              Audit Observations
            </h3>
            <ul style={{ paddingLeft: '25px', color: '#334155', lineHeight: '1.8', fontSize: '18px' }}>
              {data.observations.map((obs, i) => <li key={i} style={{marginBottom: '10px'}}>{obs}</li>)}
            </ul>
          </div>

          <div style={styles.leakHero}>
            <span style={{ fontSize: '14px', color: '#0369a1', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Captured Margin Leak Per Cart
            </span>
            <div style={{ fontSize: '56px', fontWeight: '900', color: '#0c4a6e', marginTop: '8px' }}>
              ${unitLeak.toFixed(2)}
            </div>
          </div>

          <div style={styles.scenarioBox}>
            <div style={styles.scenarioHeader}>Illustrative Exposure Scenarios</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Order Volume Scenario</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Est. Margin Impact</th>
                </tr>
              </thead>
              <tbody>
                {[10, 50, 100].map(qty => (
                  <tr key={qty}>
                    <td style={styles.td}>{qty} Typical Carts</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '800', color: '#b91c1c', fontSize: '20px' }}>
                      ${(qty * unitLeak).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '15px 25px', fontSize: '13px', color: '#94a3b8', backgroundColor: '#f8fafc', fontStyle: 'italic' }}>
              *Scenarios are illustrative only and based on observed logic gaps. Not based on internal order data.
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          Render Build: v2.6.0 • High-Fidelity Professional Audit • Decision-Ready Data
        </div>
      </div>
    </div>
  );
}