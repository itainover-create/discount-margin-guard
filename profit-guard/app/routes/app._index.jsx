// app/routes/app._index.jsx
import { useLoaderData } from "react-router"; 
import { authenticate } from "../shopify.server";
import { 
  Page, Layout, Card, ResourceList, Text, Badge, BlockStack, Box,
  Banner, AppProvider, InlineStack, Divider, Button
} from "@shopify/polaris";
import { AlertCircleIcon, InfoIcon, ExternalIcon } from '@shopify/polaris-icons';
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopName = session.shop.replace(".myshopify.com", "");

  const response = await admin.graphql(
    `#graphql
    query getAuditData {
      orders(first: 20, query: "financial_status:paid") {
        edges {
          node {
            id
            name
            legacyResourceId
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
                  discountedUnitPriceSet { shopMoney { amount } }
                  variant { 
                    price
                    inventoryItem { unitCost { amount } } 
                  }
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

  let totalItems = 0;
  let itemsWithCost = 0;
  let totalLoss = 0;

  const report = orders.map(order => {
    const discounts = order.discountApplications.edges.map(e => e.node.code || e.node.title);
    const stacking = discounts.length > 1;
    
    const items = order.lineItems.edges.map(({ node }) => {
      totalItems++;
      const price = parseFloat(node.discountedUnitPriceSet.shopMoney.amount);
      const originalPrice = parseFloat(node.variant?.price || price);
      const costField = node.variant?.inventoryItem?.unitCost;
      const discountPct = originalPrice > 0 ? ((1 - price / originalPrice) * 100).toFixed(0) : 0;

      if (costField) {
        itemsWithCost++;
        const cost = parseFloat(costField.amount);
        const profit = price - cost;
        if (profit < 0) totalLoss += Math.abs(profit);
        return { title: node.title, price, cost, hasCost: true, isLoss: profit < 0, discountPct };
      }
      return { title: node.title, price, cost: null, hasCost: false, isLoss: false, discountPct };
    });

    return { 
      id: order.id, 
      legacyId: order.legacyResourceId,
      name: order.name, 
      stacking, 
      appliedDiscounts: discounts,
      hasLoss: items.some(i => i.isLoss),
      details: items
    };
  });

  const coverage = totalItems > 0 ? (itemsWithCost / totalItems) : 0;
  let mode = "discount_only";
  if (coverage >= 0.9) mode = "full";
  else if (coverage >= 0.3) mode = "hybrid";

  const hasAnyLoss = totalLoss > 0;
  const hasAnyStacking = report.some(o => o.stacking);

  return { report, shopName, stats: { coverage: (coverage * 100).toFixed(0), totalLoss: totalLoss.toFixed(2), mode, hasAnyLoss, hasAnyStacking } };
};

export default function Index() {
  const { report, shopName, stats } = useLoaderData();

  const renderBanner = () => {
    // Mode 1: Real loss detected - Red Banner
    if (stats.hasAnyLoss) {
      return (
        <Banner title="Critical Margin Loss Detected" tone="critical" icon={AlertCircleIcon}>
          <Text variant="bodyLg" as="p">
            We found a real loss of <b>${stats.totalLoss}</b> in your last 20 orders. Products are being sold below cost!
          </Text>
        </Banner>
      );
    }
    // Mode 2: No loss but stacking exists - Yellow Banner
    if (stats.hasAnyStacking) {
      return (
        <Banner title="Discount Stacking Warning" tone="warning" icon={InfoIcon}>
          <Text variant="bodyLg" as="p">
            No direct losses found, but customers are using multiple discounts. This may erode your margins.
          </Text>
        </Banner>
      );
    }
    // Mode 3: Clean Audit - Green Banner
    return (
      <Banner title="System Audit Complete" tone="success">
        <Text variant="bodyLg" as="p">No pricing anomalies or margin leaks found in your recent orders.</Text>
      </Banner>
    );
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Profit Guard: Live Audit">
        <Layout>
          <Layout.Section>
            <Box paddingBlockEnd="600">
              {renderBanner()}
            </Box>
          </Layout.Section>
          
          <Layout.Section>
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: 'order', plural: 'orders' }}
                items={report}
                renderItem={(order) => {
                  const adminUrl = `https://admin.shopify.com/store/${shopName}/orders/${order.legacyId}`;
                  return (
                    <ResourceList.Item id={order.id}>
                      <Box padding="600">
                        <BlockStack gap="500">
                          <InlineStack align="space-between">
                            <BlockStack gap="200">
                              <Text variant="headingLg" as="h3">Order {order.name}</Text>
                              <InlineStack gap="300">
                                {order.stacking && <Badge tone="warning" size="large">⚠️ STACKING DETECTED</Badge>}
                                {stats.mode !== "discount_only" && order.hasLoss && <Badge tone="critical" size="large">🛑 MARGIN KILLER</Badge>}
                              </InlineStack>
                            </BlockStack>
                            <Button icon={ExternalIcon} url={adminUrl} target="_blank" size="large">View Order</Button>
                          </InlineStack>

                          <Box padding="500" background="bg-surface-secondary" borderRadius="300">
                            <BlockStack gap="300">
                              <Text variant="headingMd" fontWeight="bold">Root Cause Analysis:</Text>
                              <Text variant="bodyLg">• Applied Discounts: {order.appliedDiscounts.join(' + ') || 'None'}</Text>
                              
                              {order.details.map((item, i) => (
                                <Box key={i}>
                                  {item.isLoss ? (
                                    <Text variant="bodyLg" tone="critical" fontWeight="bold">
                                      • {item.title}: Sold at loss! (${item.price} vs cost ${item.cost})
                                    </Text>
                                  ) : (
                                    <Text variant="bodyLg" tone="subdued">• {item.title}: {item.discountPct}% Discount Applied</Text>
                                  )}
                                </Box>
                              ))}
                            </BlockStack>
                          </Box>
                        </BlockStack>
                      </Box>
                      <Divider />
                    </ResourceList.Item>
                  );
                }}
              />
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Box paddingBlockStart="600" paddingBlockEnd="600">
              <InlineStack align="center" gap="400">
                <Text variant="bodyLg" tone="subdued">Cost Data Coverage: {stats.coverage}%</Text>
                {stats.mode !== "full" && (
                  <Button variant="plain" url={`https://admin.shopify.com/store/${shopName}/products`} target="_blank" size="large">Add Unit Costs Now</Button>
                )}
              </InlineStack>
            </Box>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}