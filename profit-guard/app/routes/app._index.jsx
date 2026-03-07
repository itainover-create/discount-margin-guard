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
    if (stats.hasAnyLoss) {
      return (
        <Banner title="CRITICAL MARGIN LOSS" tone="critical" icon={AlertCircleIcon}>
          <Box paddingBlockStart="300">
            <Text variant="headingLg" as="p">
              Real loss of <Text variant="headingXl" as="span" tone="critical">${stats.totalLoss}</Text> detected. 
              Items sold below cost!
            </Text>
          </Box>
        </Banner>
      );
    }
    if (stats.hasAnyStacking) {
      return (
        <Banner title="DISCOUNT STACKING WARNING" tone="warning" icon={InfoIcon}>
          <Box paddingBlockStart="400" paddingBlockEnd="200">
            <Text variant="headingLg" as="p">
              No direct losses found, but multiple discounts are active. This may erode your future margins.
            </Text>
          </Box>
        </Banner>
      );
    }
    return (
      <Banner title="System Audit Healthy" tone="success">
        <Text variant="headingLg" as="p">No pricing anomalies or margin leaks found in your recent orders.</Text>
      </Banner>
    );
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Profit Guard: Live Audit" compactTitle>
        <Layout>
          {/* Header Stats - Matched to Title Style */}
          <Layout.Section>
            <Box paddingBlockEnd="500">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingXl" as="h2">
                  Data Reliability: {stats.coverage}% Cost Coverage
                </Text>
                {stats.mode !== "full" && (
                  <Button variant="plain" url={`https://admin.shopify.com/store/${shopName}/products`} target="_blank">
                    Add missing costs
                  </Button>
                )}
              </InlineStack>
            </Box>
            {renderBanner()}
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
                                {order.stacking && <Badge tone="warning" size="large">⚠️ STACKING</Badge>}
                                {stats.mode !== "discount_only" && order.hasLoss && <Badge tone="critical" size="large">🛑 LOSS</Badge>}
                              </InlineStack>
                            </BlockStack>
                            <Button icon={ExternalIcon} url={adminUrl} target="_blank" size="large">View</Button>
                          </InlineStack>

                          {/* Analysis Box - All Black and Large Fonts */}
                          <Box padding="500" background="bg-surface-secondary" borderRadius="300">
                            <BlockStack gap="300">
                              <Text variant="headingMd" fontWeight="bold">Analysis:</Text>
                              <Text variant="headingMd">• Applied Discounts: {order.appliedDiscounts.join(' + ') || 'None'}</Text>
                              
                              {order.details.map((item, i) => (
                                <Box key={i}>
                                  {item.isLoss ? (
                                    <Text variant="headingMd" tone="critical" fontWeight="bold">
                                      • {item.title}: Loss (${item.price} vs cost ${item.cost})
                                    </Text>
                                  ) : (
                                    <Text variant="headingMd" fontWeight="medium">
                                      • {item.title}: {item.discountPct}% off
                                    </Text>
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
        </Layout>
      </Page>
    </AppProvider>
  );
}