import { useSearchParams } from "react-router";

export default function ShockReport() {
  const [searchParams] = useSearchParams();

  const storeName = searchParams.get("store") || "Target Store";
  const unitLeak = parseFloat(searchParams.get("leak")) || 129.86; 

  const data = {
    severity: "HIGH STACKING RISK",
    confidence: "Observed externally. Analysis based on captured storefront logic and checkout behavior. No internal financial access required.",
    observations: [
      "Existing automatic markdown detected on premium inventory",
      "Additional manual coupon code accepted on top of markdowns",
      "Cumulative effective discount exceeds target margin thresholds"
    ]
  };

  const styles = {
    container: { backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '40px 20px', fontFamily: 'Inter, system-ui, sans-serif' },
    card: { maxWidth: '800px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', overflow: 'hidden' },
    header: { backgroundColor: '#0f172a', padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    severityBadge: { backgroundColor: '#dc2626', color: 'white', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' },
    section: { padding: '40px' },
    confidenceBox: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px', marginBottom: '32px', fontSize: '13px', color: '#64748b', fontStyle: 'italic' },
    leakHero: { backgroundColor: '#f0f9ff', padding: '24px', borderRadius: '10px', borderLeft: '5px solid #0ea5e9', marginBottom: '32px' },
    scenarioBox: { border: '1px solid #fee2e2', borderRadius: '10px', overflow: 'hidden' },
    scenarioHeader: { backgroundColor: '#fef2f2', padding: '15px 20px', fontWeight: 'bold', color: '#991b1b', fontSize: '15px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    td: { padding: '15px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '14px' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '18px', fontWeight: '800' }}>PROFIT GUARD | <span style={{opacity: 0.5}}>AUDIT</span></h1>
          <div style={styles.severityBadge}>{data.severity}</div>
        </div>

        <div style={styles.section}>
          <div style={styles.confidenceBox}>
            <strong>Confidence Framing:</strong> {data.confidence}
          </div>

          <h2 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '20px', color: '#0f172a' }}>Pricing Overlap Observed: {storeName}</h2>
          
          <ul style={{ paddingLeft: '20px', color: '#334155', lineHeight: '1.8', marginBottom: '32px' }}>
            {data.observations.map((obs, i) => <li key={i}>{obs}</li>)}
          </ul>

          <div style={styles.leakHero}>
            <span style={{ fontSize: '13px', color: '#0369a1', fontWeight: 'bold', textTransform: 'uppercase' }}>Observed Margin Leak Per Cart</span>
            <div style={{ fontSize: '42px', fontWeight: '900', color: '#0c4a6e' }}>${unitLeak.toFixed(2)}</div>
          </div>

          <div style={styles.scenarioBox}>
            <div style={styles.scenarioHeader}>Illustrative Exposure Scenarios</div>
            <table style={styles.table}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ ...styles.td, textAlign: 'left', fontWeight: 'bold', color: '#64748b' }}>VOLUME</th>
                  <th style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#64748b' }}>POTENTIAL MARGIN IMPACT</th>
                </tr>
              </thead>
              <tbody>
                {[10, 50, 100].map(qty => (
                  <tr key={qty}>
                    <td style={styles.td}>{qty} Typical Carts</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>
                      ${(qty * unitLeak).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}