import { useLoaderData } from "@react-router/react";
import { authenticate } from "../shopify.server";
import { 
  Page, 
  Layout, 
  Card, 
  ResourceList, 
  Text, 
  Badge, 
  BlockStack, 
  Box,
  Banner
} from "@shopify/polaris";

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
                  ... on DiscountCodeApplication { code }
                  ... on AutomaticDiscountApplication { title }
                }
              }
            }
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
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

  // לוגיקת ה-Shock Report (חישוב ב-Backend)
  const report = orders.map(order => {
    const stackingCount = order.discountApplications.edges.length;
    const items = order.lineItems.edges.map(({ node }) => {
      const price = parseFloat(node.discountedUnitPriceSet.shopMoney.amount);
      const cost = node.variant?.inventoryItem?.unitCost ? parseFloat(node.variant.inventoryItem.unitCost.amount) : null;
      return { 
        title: node.title, 
        price, 
        cost, 
        isLoss: cost ? price < cost : false 
      };
    });

    const hasLoss = items.some(i => i.isLoss);
    return { 
      id: order.id,
      name: order.name, 
      stacking: stackingCount > 1, 
      hasLoss, 
      items 
    };
  });

  return { report };
};

export default function Index() {
  const { report } = useLoaderData();
  const criticalOrders = report.filter(o => o.stacking || o.hasLoss);

  return (
    <Page title="Profit Guard: Shock Report">
      <Layout>
        {/* Banner סיכום הלם */}
        <Layout.Section>
          {criticalOrders.length > 0 ? (
            <Banner title={`Found ${criticalOrders.length} critical profit leaks`} status="critical">
              <p>These orders are either selling below cost or using multiple discounts (stacking).</p>
            </Banner>
          ) : (
            <Banner title="All systems clear" status="success">
              <p>No immediate profit leaks detected in your last 20 orders.</p>
            </Banner>
          )}
        </Layout.Section>

        {/* רשימת ההזמנות הבעייתיות */}
        <Layout.Section>
          <Card padding="0">
            <ResourceList
              resourceName={{ singular: 'order', plural: 'orders' }}
              items={report}
              renderItem={(order) => {
                const isCritical = order.hasLoss || order.stacking;
                
                return (
                  <ResourceList.Item
                    id={order.id}
                    accessibilityLabel={`Details for order ${order.name}`}
                    persistActions
                  >
                    <Box padding="400">
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold">
                          Order {order.name}
                        </Text>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {order.hasLoss && (
                            <Badge tone="critical">🛑 Loss on Product</Badge>
                          )}
                          {order.stacking && (
                            <Badge tone="warning">⚠️ Stacking Detected</Badge>
                          )}
                          {!isCritical && (
                            <Badge tone="success">Healthy</Badge>
                          )}
                        </div>
                      </BlockStack>
                    </Box>
                  </ResourceList.Item>
                );
              }}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}