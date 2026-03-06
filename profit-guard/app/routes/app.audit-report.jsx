// app/routes/app.audit-report.jsx
import { authenticate } from "../shopify.server";
import { processFinancialData } from "../models/audit.server";
import PDFDocument from "pdfkit";
import { PassThrough } from "stream";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // 1. שליפת הנתונים (אותה שאילתה כמו בדף הבית)
  const response = await admin.graphql(
    `#graphql
    query getOrders {
      orders(first: 50, query: "financial_status:paid") {
        edges {
          node {
            totalPriceSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
            lineItems(first: 10) {
              edges {
                node {
                  quantity
                  variant { inventoryItem { unitCost { amount } } }
                }
              }
            }
          }
        }
      }
    }`,
  );

  const responseJson = await response.json();
  const orders = responseJson.data.orders.edges.map((edge) => edge.node);
  const stats = processFinancialData(orders);

  // 2. יצירת ה-PDF כ-Stream
  const doc = new PDFDocument({ margin: 50 });
  const stream = new PassThrough();
  doc.pipe(stream);

  // --- לוגיקת העיצוב (הבאנר והתוכן) ---
  const isLoss = stats.netProductProfit < 0;
  if (isLoss) {
    doc.rect(0, 0, 612, 60).fill("#c0392b");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text("CRITICAL LOSS DETECTED", 0, 25, { align: "center" });
  } else {
    doc.rect(0, 0, 612, 60).fill("#e67e22");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text("PROFIT GUARD: STRATEGIC AUDIT", 0, 25, { align: "center" });
  }

  doc.moveDown(4).fillColor("#2c3e50").font("Helvetica-Bold").fontSize(22).text("Detailed Financial Audit");
  doc.moveDown().font("Helvetica").fontSize(12).fillColor("#000");
  doc.text(`Total Orders Analyzed: ${stats.totalOrders}`);
  doc.text(`Real Product Margin: ${stats.realMargin}%`);
  doc.text(`Net Product Profit: $${stats.netProductProfit.toFixed(2)}`);
  
  doc.moveDown().fontSize(10).fillColor("#7f8c8d").text("Disclaimer: Calculations isolate shipping revenue and include estimated transaction fees.");
  doc.end();

  // 3. החזרת ה-PDF עם ה-Headers המתאימים להורדה
  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Profit_Guard_Audit_${new Date().toISOString().split('T')[0]}.pdf"`,
    },
  });
};