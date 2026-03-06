// app/routes/app._index.jsx
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Sacred Query: שליפת נתונים לזיהוי Stacking והפסדים
  const response = await admin.graphql(
    `#graphql
    query getAuditData {
      orders(first: 20, query: "financial_status:paid") {
        edges {
          node {
            id
            name
            discountApplications(first: 5) {
              edges {
                node {
                  ... on DiscountCodeApplication { code value { ... on MoneyV2 { amount } } }
                  ... on AutomaticDiscountApplication { title value { ... on MoneyV2 { amount } } }
                }
              }
            }
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet { shopMoney { amount } }
                  discountedUnitPriceSet { shopMoney { amount } }
                  variant { inventoryItem { unitCost { amount } } }
                }
              }
            }
          }
        }
      }
    }`
  );

  const data = await response.json();
  const orders = data.data.orders.edges.map(e => e.node);

  // לוגיקת ה-Shock Report (חישוב מהיר ב-Backend)
  const report = orders.map(order => {
    const stackingCount = order.discountApplications.edges.length;
    const items = order.lineItems.edges.map(({ node }) => {
      const price = parseFloat(node.discountedUnitPriceSet.shopMoney.amount);
      const cost = node.variant?.inventoryItem?.unitCost ? parseFloat(node.variant.inventoryItem.unitCost.amount) : null;
      return { title: node.title, price, cost, isLoss: cost ? price < cost : false };
    });

    const hasLoss = items.some(i => i.isLoss);
    return { name: order.name, stacking: stackingCount > 1, hasLoss, items };
  });

  return { report };
};

export default function Index() {
  const { report } = useLoaderData();
  const criticalOrders = report.filter(o => o.stacking || o.hasLoss);

  return (
    <s-page heading="Profit Guard: Shock Report">
      <s-section>
        <s-box padding="base" background="surface-critical" borderRadius="base">
          <s-heading>Critical Orders Found: {criticalOrders.length}</s-heading>
        </s-box>
      </s-section>

      <s-section heading="Order Audit Details">
        <s-box padding="base" borderWidth="base" borderRadius="base">
           {criticalOrders.map(order => (
             <s-box key={order.name} padding="tight" borderBottomWidth="base">
               <s-text as="p">
                 <strong>Order {order.name}</strong>: 
                 {order.stacking ? " ⚠️ STACKING DETECTED" : ""} 
                 {order.hasLoss ? " 🛑 LOSS ON PRODUCT" : ""}
               </s-text>
             </s-box>
           ))}
        </s-box>
      </s-section>
    </s-page>
  );
}