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

  // הוספת reverse: true כדי לקבל את ה-20 הכי חדשות
  const response = await admin.graphql(
    `#graphql
    query getAuditData {
      orders(first: 20, query: "financial_status:paid", reverse: true) {
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
  let mode = "full";
  if (coverage < 0.3) mode = "discount_only";
  else if (coverage < 0.9) mode = "hybrid";

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
              Real loss of <Text variant="headingLg" as="span" tone="critical" fontWeight="bold">${stats.totalLoss}</Text> detected. 
              Items sold below cost!
            </Text>
          </Box>
        </Banner>
      );
    }
    
    if (stats.hasAnyStacking) {
      const missingDataNudge = stats.mode === "discount_only" 
        ? " Note: Product costs are missing—we cannot determine if these stacks cause actual losses."
        : "";

      return (
        <Banner title="DISCOUNT STACKING WARNING" tone="warning" icon={InfoIcon}>
          <Box paddingBlockStart="300" paddingBlockEnd="100">
            <Text variant="headingLg" as="p">
              Multiple discounts are active, which may erode your margins. 
              <Text variant="headingLg" as="span" fontWeight="bold">{missingDataNudge}</Text>
            </Text>
          </Box>
        </Banner>
      );
    }

    if (stats.mode === "discount_only") {
      return (
        <Banner title="Audit Complete: No Stacking Detected" tone="info">
          <Box paddingBlockStart="300">
            <Text variant="headingLg" as="p">
              No discount stacks found. <Text fontWeight="bold" as="span">Product costs are missing</Text>—add costs now to monitor if future discounts erode your margins.
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
      <Page narrowWidth>
        <Layout>
          <Layout.Section>
            <Box paddingBlockStart="600" paddingBlockEnd="800">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="heading2xl" as="h1" fontWeight="bold">
                  Profit Guard: Live Audit
                </Text>
                <Text variant="heading2xl" as="h1" fontWeight="bold">
                  Data Reliability: {stats.coverage}% Cost Coverage
                </Text>
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
                                {order.hasLoss && <Badge tone="critical" size="large">🛑 LOSS</Badge>}
                              </InlineStack>
                            </BlockStack>
                            <Button icon={ExternalIcon} url={adminUrl} target="_blank" size="large">View</Button>
                          </InlineStack>

                          <Box padding="600" background="bg-surface-secondary" borderRadius="300">
                            <BlockStack gap="400">
                              <Text variant="headingLg" fontWeight="bold">Analysis:</Text>
                              <Text variant="headingLg" fontWeight="bold">• Applied Discounts: {order.appliedDiscounts.join(' + ') || 'None'}</Text>
                              {order.details.map((item, i) => (
                                <Box key={i}>
                                  <Text variant="headingLg" fontWeight="bold" tone={item.isLoss ? "critical" : "default"}>
                                    • {item.title}: {item.isLoss ? `Loss ($${item.price} vs cost $${item.cost})` : `${item.discountPct}% off`}
                                  </Text>
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