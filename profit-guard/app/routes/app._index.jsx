// app/routes/app._index.jsx
import { useLoaderData } from "react-router"; 
import { authenticate } from "../shopify.server";
import { 
  Page, Layout, Card, ResourceList, Text, Badge, BlockStack, Box,
  Banner, AppProvider, InlineStack, Divider, ProgressBar, Button, Icon
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
  let mode = "discount_only"; // Default < 30%
  if (coverage >= 0.9) mode = "full";
  else if (coverage >= 0.3) mode = "hybrid";

  return { report, shopName, stats: { coverage: (coverage * 100).toFixed(0), totalLoss: totalLoss.toFixed(2), mode } };
};

export default function Index() {
  const { report, shopName, stats } = useLoaderData();

  const renderBanner = () => {
    switch (stats.mode) {
      case "full":
        return (
          <Banner title="CRITICAL MARGIN AUDIT" tone="critical" icon={AlertCircleIcon}>
            <Text as="p">Full data coverage ({stats.coverage}%). You lost <b>${stats.totalLoss}</b> on these orders due to pricing/stacking errors.</Text>
          </Banner>
        );
      case "hybrid":
        return (
          <Banner title="PARTIAL PROFIT AUDIT" tone="warning" icon={InfoIcon}>
            <Text as="p">Analyzing {stats.coverage}% of items. We identified <b>${stats.totalLoss}</b> in known losses. Add more unit costs for a 100% accurate report.</Text>
          </Banner>
        );
      default:
        return (
          <Banner title="DISCOUNT STACKING REPORT" tone="info" icon={InfoIcon}>
            <Text as="p">Cost data missing for {100 - stats.coverage}% of items. We are auditing <b>Stacking Signatures</b> and combined discount impact.</Text>
          </Banner>
        );
    }
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Profit Guard: Live Audit">
        <Layout>
          <Layout.Section>{renderBanner()}</Layout.Section>
          
          <Layout.Section>
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: 'order', plural: 'orders' }}
                items={report}
                renderItem={(order) => {
                  const adminUrl = `https://admin.shopify.com/store/${shopName}/orders/${order.legacyId}`;
                  return (
                    <ResourceList.Item id={order.id}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <Text variant="headingMd" as="h3">Order {order.name}</Text>
                              <InlineStack gap="200">
                                {order.stacking && <Badge tone="warning">⚠️ STACKING ATTACK</Badge>}
                                {stats.mode !== "discount_only" && order.hasLoss && <Badge tone="critical">🛑 MARGIN KILLER</Badge>}
                              </InlineStack>
                            </BlockStack>
                            <Button icon={ExternalIcon} url={adminUrl} target="_blank">View Order</Button>
                          </InlineStack>

                          <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="100">
                              <Text variant="bodySm" fontWeight="bold">Root Cause Analysis:</Text>
                              <Text variant="bodySm">• Discounts: {order.appliedDiscounts.join(' + ') || 'None'}</Text>
                              
                              {order.details.map((item, i) => (
                                <Box key={i}>
                                  {item.isLoss ? (
                                    <Text variant="bodySm" tone="critical">• {item.title}: Sold at loss (${item.price} vs cost ${item.cost})</Text>
                                  ) : (
                                    <Text variant="bodySm" tone="subdued">• {item.title}: {item.discountPct}% Discount Applied</Text>
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

          {stats.mode !== "full" && (
            <Layout.Section>
              <Box paddingBlockStart="400" paddingBlockEnd="400">
                <InlineStack align="center">
                  <Text variant="bodyMd" tone="subdued">Missing cost data for some products.</Text>
                  <Button variant="plain" url={`https://admin.shopify.com/store/${shopName}/products`} target="_blank">Add Unit Costs now</Button>
                </InlineStack>
              </Box>
            </Layout.Section>
          )}
        </Layout>
      </Page>
    </AppProvider>
  );
}