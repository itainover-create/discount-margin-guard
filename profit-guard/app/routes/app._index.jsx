// app/routes/app._index.jsx
import { useLoaderData } from "react-router"; 
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
  Banner,
  AppProvider,
  Icon,
  InlineStack,
  Divider
} from "@shopify/polaris";
import { AlertCircleIcon, CheckCircleIcon, CashDollarIcon } from '@shopify/polaris-icons';
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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

  const report = orders.map(order => {
    const discounts = order.discountApplications.edges.map(e => e.node.code || e.node.title);
    const stacking = discounts.length > 1;
    
    const lossItems = order.lineItems.edges
      .map(({ node }) => {
        const price = parseFloat(node.discountedUnitPriceSet.shopMoney.amount);
        const cost = node.variant?.inventoryItem?.unitCost ? parseFloat(node.variant.inventoryItem.unitCost.amount) : null;
        return { title: node.title, price, cost, isLoss: cost ? price < cost : false };
      })
      .filter(item => item.isLoss);

    return { 
      id: order.id, 
      name: order.name, 
      stacking, 
      appliedDiscounts: discounts,
      hasLoss: lossItems.length > 0,
      lossDetails: lossItems 
    };
  });

  return { report };
};

export default function Index() {
  const { report } = useLoaderData();
  const criticalOrders = report.filter(o => o.stacking || o.hasLoss);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Profit Guard: Live Audit">
        <Layout>
          {/* באנר עליון משודרג */}
          <Layout.Section>
            {criticalOrders.length > 0 ? (
              <Box paddingBlockEnd="400">
                <Banner 
                  title={`CRITICAL: ${criticalOrders.length} PROFIT LEAKS DETECTED`} 
                  tone="critical"
                  icon={AlertCircleIcon}
                >
                  <Text variant="bodyLg" as="p">
                    Action required! Your margins are being destroyed by stacking discounts or below-cost sales.
                  </Text>
                </Banner>
              </Box>
            ) : (
              <Banner title="System Healthy" tone="success" icon={CheckCircleIcon}>
                <p>All recent transactions are within profitable margins.</p>
              </Banner>
            )}
          </Layout.Section>

          {/* רשימת ההזמנות בעיצוב מרשים */}
          <Layout.Section>
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: 'order', plural: 'orders' }}
                items={report}
                renderItem={(order) => {
                  const isCritical = order.hasLoss || order.stacking;
                  return (
                    <ResourceList.Item id={order.id} verticalAlignment="center">
                      <Box padding="500" background={isCritical ? "bg-surface-critical-secondary" : undefined}>
                        <BlockStack gap="400">
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <Text variant="headingLg" as="h3">Order {order.name}</Text>
                              <InlineStack gap="200">
                                {order.hasLoss && <Badge tone="critical" size="large">🛑 MARGIN KILLER</Badge>}
                                {order.stacking && <Badge tone="warning" size="large">⚠️ STACKING ATTACK</Badge>}
                                {!(order.hasLoss || order.stacking) && <Badge tone="success">Healthy</Badge>}
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>

                          {/* פירוט הבעיה */}
                          {isCritical && (
                            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <Text variant="bodyMd" fontWeight="bold">Why is this a leak?</Text>
                                {order.stacking && (
                                  <Text variant="bodySm" tone="subdued">
                                    • Combined Discounts: {order.appliedDiscounts.join(' + ')}
                                  </Text>
                                )}
                                {order.hasLoss && order.lossDetails.map((item, idx) => (
                                  <Text key={idx} variant="bodySm" tone="critical">
                                    • {item.title}: Sold for ${item.price} (Cost: ${item.cost})
                                  </Text>
                                ))}
                              </BlockStack>
                            </Box>
                          )}
                        </BlockStack>
                      </Box>
                      <Divider />
                    </ResourceList.Item>
                  );
                }}
              />
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}