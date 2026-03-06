import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import fetch from 'node-fetch';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function runProfitGuardAudit(shopUrl, accessToken) {
    console.log(`🚀 Starting Profit Guard Audit for: ${shopUrl}...`);
    try {
        const orders = await fetchShopifyOrders(shopUrl, accessToken);
        if (orders.length === 0) throw new Error("No paid orders found to analyze.");

        const stats = processFinancialData(orders);
        const aiAnalysis = await getAIStrategicAnalysis(stats);

        const fileName = `Profit_Guard_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        generateProfessionalPDF(stats, aiAnalysis, fileName);

        console.log(`✅ Audit Complete! Report generated: ${fileName}`);
    } catch (error) {
        console.error('❌ Audit Failed:', error.message);
    } finally {
        accessToken = null; // אבטחה: מחיקת הטוקן מהזיכרון
        console.log('🔒 Security: Session ended. Access token cleared.');
    }
}

async function fetchShopifyOrders(shopUrl, accessToken) {
    const query = `
    {
      orders(first: 50, query: "financial_status:paid") {
        edges {
          node {
            id
            totalPriceSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
            lineItems(first: 10) {
              edges {
                node {
                  quantity
                  variant {
                    inventoryItem {
                      unitCost { amount }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const response = await fetch(`https://${shopUrl}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query })
    });

    const result = await response.json();
    if (result.errors) throw new Error(result.errors[0].message);
    return result.data.orders.edges.map(edge => edge.node);
}

function processFinancialData(orders) {
    let stats = {
        totalOrders: 0,
        grossRevenue: 0,
        totalShipping: 0,
        totalCOGS: 0,
        totalFees: 0,
        missingCogsCount: 0,
        ordersAtLossCount: 0,
        expectedMargin: 35 // רף להשוואה
    };

    orders.forEach(order => {
        stats.totalOrders++;
        const revenue = parseFloat(order.totalPriceSet.shopMoney.amount);
        const shipping = parseFloat(order.totalShippingPriceSet.shopMoney.amount);
        const fees = (revenue * 0.029) + 0.30; // עמלת סליקה משוערת
        
        let orderCOGS = 0;
        order.lineItems.edges.forEach(({ node }) => {
            if (node.variant?.inventoryItem?.unitCost) {
                orderCOGS += parseFloat(node.variant.inventoryItem.unitCost.amount) * node.quantity;
            } else {
                stats.missingCogsCount++;
            }
        });

        const orderNetProfit = (revenue - shipping) - orderCOGS - fees;
        if (orderNetProfit < 0) stats.ordersAtLossCount++;

        stats.grossRevenue += revenue;
        stats.totalShipping += shipping;
        stats.totalCOGS += orderCOGS;
        stats.totalFees += fees;
    });

    stats.netProductProfit = (stats.grossRevenue - stats.totalShipping) - stats.totalCOGS - stats.totalFees;
    return stats;
}

function generateProfessionalPDF(stats, aiAnalysis, fileName) {
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(fs.createWriteStream(fileName));

    const realProductRevenue = stats.grossRevenue - stats.totalShipping;
    const realMargin = (stats.netProductProfit / realProductRevenue) * 100;
    const isLoss = stats.netProductProfit < 0;

    // באנר דינמי
    if (isLoss) {
        doc.rect(0, 0, 612, 60).fill('#c0392b');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
           .text(`${stats.ordersAtLossCount} ORDERS ANALYZED AS NET LOSS`, 0, 25, { align: 'center' });
    } else {
        const marginGap = (stats.expectedMargin - realMargin).toFixed(1);
        doc.rect(0, 0, 612, 60).fill('#e67e22');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
           .text(`MARGIN GAP: Real margin is ${marginGap}% lower than Shopify dashboard`, 0, 25, { align: 'center' });
    }
    
    doc.moveDown(4).fillColor('#2c3e50').font('Helvetica-Bold').fontSize(22).text('PROFIT GUARD: Strategic Audit');
    doc.font('Helvetica').fontSize(10).fillColor('#7f8c8d').text(`Report ID: PG-${Date.now().toString(36).toUpperCase()}`);
    doc.moveDown(2);

    doc.fillColor('#2980b9').fontSize(16).text('1. Financial Summary', { underline: true }).moveDown(0.5);
    doc.fillColor('#000').fontSize(12).font('Helvetica');
    doc.text(`Total Revenue: $${stats.grossRevenue.toFixed(2)}`);
    doc.text(`Shipping Pass-through: -$${stats.totalShipping.toFixed(2)}`);
    doc.text(`COGS: $${stats.totalCOGS.toFixed(2)}`);
    doc.text(`Estimated Fees: $${stats.totalFees.toFixed(2)}`);
    doc.moveDown().font('Helvetica-Bold').text(`NET PRODUCT PROFIT: $${stats.netProductProfit.toFixed(2)}`);
    doc.text(`REAL PRODUCT MARGIN: ${realMargin.toFixed(2)}%`).moveDown(2);

    doc.fillColor('#2980b9').fontSize(16).text('2. Strategic Diagnosis', { underline: true }).moveDown();
    doc.font('Helvetica').fontSize(11).fillColor('#34495e').text(aiAnalysis.replace(/\*/g, ''), { lineGap: 3 });

    const bottomY = doc.page.height - 70;
    doc.fontSize(8).fillColor('#bdc3c7').text('• Based on the last 50 paid orders.', 50, bottomY);
    if (stats.missingCogsCount > 0) {
        doc.fillColor('#e74c3c').text(`• ALERT: Missing cost data for ${stats.missingCogsCount} items. Check your Shopify Product Admin.`, 50, bottomY + 12);
    }
    doc.end();
}

async function getAIStrategicAnalysis(stats) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `Analyze this Shopify store profit data: ${JSON.stringify(stats)}. 
    Explain the gap between gross and net margin. Provide 3 actionable steps to stop losses. 
    Keep it professional and executive. Do not mention AI or Gemini.`;
    const result = await model.generateContent(prompt);
    return result.response.text();
}