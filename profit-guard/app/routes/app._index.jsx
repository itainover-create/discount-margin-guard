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
                  quantity
                  discountedUnitPriceSet { shopMoney { amount } }
                  discountAllocations {
                    allocatedAmountSet { shopMoney { amount } }
                  }
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
  let bleedingCount = 0;

  const report = orders.map(order => {
    const discounts = order.discountApplications.edges.map(e => e.node.code || e.node.title);
    const stacking = discounts.length > 1;
    
    let orderHasLoss = false;
    const items = order.lineItems.edges.map(({ node }) => {
      totalItems++;
      
      // 1. מחיר יחידה אחרי הנחות שורה (לפני הנחות עגלה)
      const discountedPrice = parseFloat(node.discountedUnitPriceSet.shopMoney.amount);
      const originalPrice = parseFloat(node.variant?.price || discountedPrice);
      
      // 2. חישוב הנחות עגלה שהוקצו לשורה הזו (Allocations)
      const totalAllocated = node.discountAllocations.reduce((acc, alloc) => 
        acc + parseFloat(alloc.allocatedAmountSet.shopMoney.amount), 0);
      
      // 3. המחיר הסופי האמיתי (Net)
      const netPrice = discountedPrice - (totalAllocated / node.quantity);
      const discountPct = originalPrice > 0 ? (((originalPrice - netPrice) / originalPrice) * 100).toFixed(0) : 0;

      const costField = node.variant?.inventoryItem?.unitCost;
      if (costField) {
        itemsWithCost++;
        const cost = parseFloat(costField.amount);
        const profit = netPrice - cost;
        if (profit < 0) {
          totalLoss += Math.abs(profit) * node.quantity;
          orderHasLoss = true;
        }
        return { title: node.title, price: netPrice.toFixed(2), cost, hasCost: true, isLoss: profit < 0, discountPct };
      }
      return { title: node.title, price: netPrice.toFixed(2), cost: null, hasCost: false, isLoss: false, discountPct };
    });

    if (orderHasLoss) bleedingCount++;

    return { 
      id: order.id, 
      legacyId: order.legacyResourceId,
      name: order.name, 
      stacking, 
      appliedDiscounts: discounts,
      hasLoss: orderHasLoss,
      details: items
    };
  });

  const coverage = totalItems > 0 ? (itemsWithCost / totalItems) : 0;
  let mode = "full";
  if (coverage < 0.3) mode = "discount_only";
  else if (coverage < 0.9) mode = "hybrid";

  return { 
    report, 
    shopName, 
    stats: { 
      coverage: (coverage * 100).toFixed(0), 
      totalLoss: totalLoss.toFixed(2), 
      bleedingCount,
      mode, 
      hasAnyLoss: totalLoss > 0, 
      hasAnyStacking: report.some(o => o.stacking) 
    } 
  };
};

export default function Index() {
  const { report, shopName, stats } = useLoaderData();

  const renderBanner = () => {
    if (stats.hasAnyLoss) {
      return (
        <Banner tone="critical" icon={AlertCircleIcon}>
          <BlockStack gap="300">
            <Text variant="heading2xl" as="h2">CRITICAL MARGIN LOSS</Text>
            <Text variant="headingLg" as="p">
              Detected <Text variant="headingLg" as="span" tone="critical" fontWeight="bold">{stats.bleedingCount} Bleeding Orders</Text> totaling <Text variant="headingLg" as="span" tone="critical" fontWeight="bold">${stats.totalLoss}</Text> in losses.
            </Text>
          </BlockStack>
        </Banner>
      );
    }
    
    if (stats.hasAnyStacking) {
      const nudge = stats.mode === "discount_only" ? " You are currently flying blind without cost data." : "";
      return (
        <Banner tone="warning" icon={InfoIcon}>
          <BlockStack gap="300">
            <Text variant="heading2xl" as="h2">DISCOUNT STACKING WARNING</Text>
            <Text variant="headingLg" as="p">
              Multiple discounts are active. This may erode your margins.{' '}
              <Text variant="headingLg" as="span" fontWeight="bold">{nudge}</Text>
            </Text>
          </BlockStack>
        </Banner>
      );
    }

    if (stats.mode === "discount_only") {
      return (
        <Banner tone="info">
          <BlockStack gap="400">
            <Text variant="heading2xl" as="h2">Audit Complete: No Stacking Detected</Text>
            <Text variant="headingLg" as="p">
              Your discount rules are secure. <Text fontWeight="bold" as="span">Margin Visibility is 0%</Text>—add costs now to ensure these promotions aren't eroding your profits.
            </Text>
          </BlockStack>
        </Banner>
      );
    }

    return (
      <Banner tone="success">
        <BlockStack gap="300">
          <Text variant="heading2xl" as="h2">System Audit Healthy</Text>
          <Text variant="headingLg" as="p">No pricing anomalies or margin leaks found in your recent orders.</Text>
        </BlockStack>
      </Banner>
    );
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page narrowWidth>
        <Layout>
          <Layout.Section>
            <Box paddingBlockStart="600" paddingBlockEnd="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="heading2xl" as="h1" fontWeight="bold">
                  Profit Guard: Live Audit
                </Text>
                <Text variant="heading2xl" as="h1" fontWeight="bold">
                  Margin Visibility: {stats.coverage}%
                </Text>
              </InlineStack>
            </Box>
            
            <Box paddingBlockEnd="600">
              <Text variant="bodySm" tone="subdued">
                Based on product cost data only. Does not include shipping, fees, or taxes.
              </Text>
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
                                {order.hasLoss && <Badge tone="critical" size="large">🛑 BLEEDING</Badge>}
                              </InlineStack>
                            </BlockStack>
                            <Button icon={ExternalIcon} url={adminUrl} target="_blank" size="large">View</Button>
                          </InlineStack>

                          <Box padding="600" background="bg-surface-secondary" borderRadius="300">
                            <BlockStack gap="400">
                              <Text variant="headingLg" fontWeight="bold">Audit Analysis:</Text>
                              <Text variant="headingLg" fontWeight="bold">• Applied: {order.appliedDiscounts.join(' + ') || 'No Discounts'}</Text>
                              {order.details.map((item, i) => (
                                <Box key={i}>
                                  <Text variant="headingLg" fontWeight="bold" tone={item.isLoss ? "critical" : "default"}>
                                    • {item.title}: {item.isLoss ? `Bleeding ($${item.price} vs cost $${item.cost})` : `${item.discountPct}% off`}
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