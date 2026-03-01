import 'dotenv/config';
import fs from 'fs';
import { GoogleGenerativeAI } from "@google/generative-ai";
import PDFDocument from 'pdfkit';

const { SHOPIFY_TOKEN, SHOP_URL, API_VERSION, GEMINI_API_KEY } = process.env;

const PROCESSING_FEE_RATE = 0.029; 
const PROCESSING_FEE_FIXED = 0.30;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function runProfitGuardPipeline() {
    console.log("🚀 Running Original Profit Guard Pipeline...");

    try {
        const stats = await fetchShopifyData();
        const aiAnalysis = await getAIStrategicAnalysis(stats);
        const fileName = `Profit_Guard_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        generateProfessionalPDF(stats, aiAnalysis, fileName);

        console.log("\n✅ Original Report generated successfully!");
    } catch (error) {
        console.error("❌ Pipeline failed:", error);
    }
}

async function fetchShopifyData() {
    const graphqlUrl = `https://${SHOP_URL}/admin/api/${API_VERSION}/graphql.json`;
    const query = `{
      orders(first: 50, query: "status:any") {
        edges {
          node {
            name
            totalPriceSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
            lineItems(first: 20) {
              edges {
                node {
                  title
                  quantity
                  variant { inventoryItem { unitCost { amount } } }
                }
              }
            }
          }
        }
      }
    }`;

    const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
        body: JSON.stringify({ query })
    });

    const result = await response.json();
    const orders = result.data.orders.edges;

    let stats = { totalOrders: 0, grossRevenue: 0, totalShipping: 0, totalCOGS: 0, totalFees: 0, netProductProfit: 0 };

    orders.forEach(({ node: order }) => {
        const totalAmount = parseFloat(order.totalPriceSet.shopMoney.amount);
        const shipping = parseFloat(order.totalShippingPriceSet.shopMoney.amount || 0);
        const productRevenue = totalAmount - shipping;
        let orderCOGS = 0;
        order.lineItems.edges.forEach(({ node: item }) => {
            const cost = parseFloat(item.variant?.inventoryItem?.unitCost?.amount || 0);
            orderCOGS += (cost * item.quantity);
        });
        const fees = (totalAmount * PROCESSING_FEE_RATE) + PROCESSING_FEE_FIXED;
        const realProfit = productRevenue - orderCOGS - fees;

        stats.totalOrders++;
        stats.grossRevenue += totalAmount;
        stats.totalShipping += shipping;
        stats.totalCOGS += orderCOGS;
        stats.totalFees += fees;
        stats.netProductProfit += realProfit;
    });
    return stats;
}

async function getAIStrategicAnalysis(stats) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const margin = (stats.netProductProfit / (stats.grossRevenue - stats.totalShipping)) * 100;

    const prompt = `Analyze this Shopify data:
    - Orders: ${stats.totalOrders}
    - Revenue: $${stats.grossRevenue.toFixed(2)}
    - Net Profit: $${stats.netProductProfit.toFixed(2)}
    - Margin: ${margin.toFixed(2)}%
    Provide: EXECUTIVE SUMMARY, ROOT CAUSE OF LOSS, and 3 ACTIONABLE STRATEGIC STEPS.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

function generateProfessionalPDF(stats, aiAnalysis, fileName) {
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(fs.createWriteStream(fileName));

    // Header [cite: 47, 48]
    doc.fillColor('#2c3e50').font('Helvetica-Bold').fontSize(26).text('PROFIT GUARD', { align: 'center' });
    doc.font('Helvetica').fontSize(12).fillColor('#7f8c8d').text('Embedded Intelligence for E-commerce', { align: 'center' });
    doc.moveDown(2);

    // Financial Audit Summary [cite: 49]
    doc.fillColor('#2980b9').font('Helvetica-Bold').fontSize(18).text('Financial Audit Summary', { underline: true });
    doc.moveDown();
    doc.fillColor('#000').font('Helvetica').fontSize(12);
    doc.text(`Total Orders Analyzed: ${stats.totalOrders}`); // [cite: 50]
    doc.text(`Gross Revenue: $${stats.grossRevenue.toFixed(2)}`); // [cite: 50]
    doc.text(`Shipping (Pass-through): $${stats.totalShipping.toFixed(2)}`); // [cite: 51]
    doc.text(`Total Product COGS: $${stats.totalCOGS.toFixed(2)}`); // [cite: 51]
    doc.text(`Transaction Fees: $${stats.totalFees.toFixed(2)}`); // [cite: 52]
    doc.moveDown();

    const margin = (stats.netProductProfit / (stats.grossRevenue - stats.totalShipping)) * 100;
    doc.fillColor(stats.netProductProfit < 0 ? '#c0392b' : '#27ae60').font('Helvetica-Bold').fontSize(14);
    doc.text(`NET PRODUCT PROFIT: $${stats.netProductProfit.toFixed(2)}`); // [cite: 53]
    doc.text(`REAL PRODUCT MARGIN: ${margin.toFixed(2)}%`); // [cite: 54]
    doc.moveDown(2);

    // AI Strategic Analysis [cite: 55]
    doc.fillColor('#2980b9').font('Helvetica-Bold').fontSize(18).text('AI Strategic Analysis', { underline: true });
    doc.moveDown();
    doc.font('Helvetica').fontSize(11).fillColor('#34495e').text(aiAnalysis.replace(/\*/g, ''), { lineGap: 4 });

    doc.end();
}

runProfitGuardPipeline();