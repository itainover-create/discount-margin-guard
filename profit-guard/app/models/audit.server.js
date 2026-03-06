// app/routes/app._index.jsx
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { processFinancialData } from "../models/audit.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  // 1. אימות מול שופיפיי
  const { admin } = await authenticate.admin(request);

  // 2. שליפת 50 ההזמנות האחרונות ששולמו (GraphQL)
  const response = await admin.graphql(
    `#graphql
    query getOrders {
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
    }`,
  );

  const responseJson = await response.json();
  const orders = responseJson.data.orders.edges.map((edge) => edge.node);

  // 3. הרצת האודיט הפיננסי
  const stats = processFinancialData(orders);

  return { stats };
};

export default function Index() {
  const { stats } = useLoaderData();

  // קביעת מצב הבאנר לפי התוצאות
  const isBleeding = stats.ordersAtLossCount > 0;
  const marginGap = (stats.expectedMargin - stats.realMargin).toFixed(1);

  return (
    <s-page heading="Profit Guard: Strategic Dashboard">
      {/* באנר התראה דינמי */}
      <s-section>
        {isBleeding ? (
          <s-box padding="base" background="surface-critical" borderRadius="base" borderWidth="base" borderColor="border-critical">
            <s-stack direction="block" gap="tight">
              <s-heading>CRITICAL: Profit Bleeding Detected</s-heading>
              <s-text color="critical">
                Your store sold <strong>{stats.ordersAtLossCount}</strong> orders at a net loss. Immediate action is required on pricing or COGS.
              </s-text>
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="base" background="surface-warning" borderRadius="base" borderWidth="base" borderColor="border-warning">
            <s-stack direction="block" gap="tight">
              <s-heading>Margin Gap Alert</s-heading>
              <s-text color="warning">
                Your Real Product Margin is <strong>{stats.realMargin}%</strong>. This is <strong>{marginGap}%</strong> lower than the standard Shopify estimate.
              </s-text>
            </s-stack>
          </s-box>
        )}
      </s-section>

      {/* פירוט נתונים מרכזי */}
      <s-section heading="Financial Audit Summary">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="250px">
            <s-stack direction="block" gap="tight">
              <s-text tone="subdued">Net Product Profit</s-text>
              <s-heading>${stats.netProductProfit.toFixed(2)}</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="250px">
            <s-stack direction="block" gap="tight">
              <s-text tone="subdued">Real Product Margin</s-text>
              <s-heading>{stats.realMargin}%</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="250px">
            <s-stack direction="block" gap="tight">
              <s-text tone="subdued">Orders Analyzed</s-text>
              <s-heading>{stats.totalOrders}</s-heading>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* הערות שוליים מקצועיות */}
      <s-section slot="aside" heading="Audit Methodology">
        <s-paragraph>
          Calculations isolate <strong>Shipping Pass-through</strong> to reveal your true product profitability. 
          Formula: <s-text tone="subdued">(Revenue - Shipping) - COGS - Fees</s-text>.
        </s-paragraph>
        {stats.missingCogsCount > 0 && (
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text color="critical">
              ⚠️ Warning: Missing COGS data for <strong>{stats.missingCogsCount}</strong> line items. 
              Update your "Cost per item" in Shopify for full accuracy.
            </s-text>
          </s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="Actionable Insights">
        <s-unordered-list>
          <s-list-item>Review high-shipping cost zones.</s-list-item>
          <s-list-item>Audit transaction fee overrides.</s-list-item>
          <s-list-item>Bulk update missing product costs.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};