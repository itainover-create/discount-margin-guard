// app/routes/app._index.jsx
import { useState } from "react";
import { useLoaderData } from "react-router"; 
import { authenticate } from "../shopify.server";
import { 
  Page, Layout, Card, ResourceList, Text, Badge, BlockStack, Box,
  Banner, AppProvider, Icon, InlineStack, Divider, ProgressBar, 
  Button, ButtonGroup, EmptyState
} from "@shopify/polaris";
import { AlertCircleIcon, CheckCircleIcon, ExternalIcon, HideIcon } from '@shopify/polaris-icons';
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
                  quantity
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

  let totalLoss = 0;
  let totalPotentialProfit = 0;
  let totalActualProfit = 0;

  const report = orders.map(order => {
    const discounts = order.discountApplications.edges.map(e => e.node.code || e.node.title);
    const stacking = discounts.length > 1;
    
    let orderPotentialProfit = 0;
    let orderActualProfit = 0;

    const items = order.lineItems.edges.map(({ node }) => {
      const actualPrice = parseFloat(node.discountedUnitPriceSet.shopMoney.amount);
      const originalPrice = parseFloat(node.variant?.price || actualPrice);
      const cost = node.variant?.inventoryItem?.unitCost ? parseFloat(node.variant.inventoryItem.unitCost.amount) : 0;
      
      const profit = actualPrice - cost;
      const potential = originalPrice - cost;

      orderActualProfit += profit;
      orderPotentialProfit += potential;

      return { title: node.title, price: actualPrice, cost, isLoss: profit < 0 };
    });

    const orderLossToDiscounts = orderPotentialProfit - orderActualProfit;
    totalLoss += orderLossToDiscounts;
    totalPotentialProfit += orderPotentialProfit;
    totalActualProfit += orderActualProfit;

    return { 
      id: order.id, 
      legacyId: order.legacyResourceId,
      name: order.name, 
      stacking, 
      appliedDiscounts: discounts,
      hasLoss: items.some(i => i.isLoss),
      lossDetails: items.filter(i => i.isLoss),
      orderLossToDiscounts
    };
  });

  const profitRetention = totalPotentialProfit > 0 ? (totalActualProfit / totalPotentialProfit) * 100 : 100;

  return { 
    report, 
    shopName, 
    stats: { 
      totalLoss: totalLoss.toFixed(2), 
      profitRetention: Math.max(0, profitRetention.toFixed(0)),
      criticalCount: report.filter(o => o.stacking || o.hasLoss).length
    } 
  };
};

export default function Index() {
  const { report, shopName, stats } = useLoaderData();
  const [ignoredOrders, setIgnoredOrders] = useState([]);

  const visibleReport = report.filter(o => !ignoredOrders.includes(o.id));
  const criticalOrders = visibleReport.filter(o => o.stacking || o.hasLoss);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Profit Guard: Financial Audit">
        <Layout>
          {/* TOP SHOCK SUMMARY */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingLg" as="h2">Profit Erosion Overview</Text>
                  <Badge tone={stats.totalLoss > 0 ? "critical" : "success"} size="large">
                    Total Revenue Leaked: ${stats.totalLoss}
                  </Badge>
                </InlineStack>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="subdued">Profit Retention Rate</Text>
                    <Text variant="bodyMd" fontWeight="bold">{stats.profitRetention}%</Text>
                  </InlineStack>
                  <ProgressBar progress={parseFloat(stats.profitRetention)} tone={stats.profitRetention < 70 ? "critical" : "highlight"} />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* MAIN LIST */}
          <Layout.Section>
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: 'order', plural: 'orders' }}
                items={visibleReport}
                renderItem={(order) => {
                  const isCritical = order.hasLoss || order.stacking;
                  const adminUrl = `https://admin.shopify.com/store/${shopName}/orders/${order.legacyId}`;

                  return (
                    <ResourceList.Item id={order.id} verticalAlignment="center">
                      <Box padding="500" background={isCritical ? "bg-surface-critical-secondary" : undefined}>
                        <BlockStack gap="400">
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <Text variant="headingMd" as="h3">Order {order.name}</Text>
                              <InlineStack gap="200">
                                {order.hasLoss && <Badge tone="critical">🛑 MARGIN LOSS</Badge>}
                                {order.stacking && <Badge tone="warning">⚠️ STACKING</Badge>}
                              </InlineStack>
                            </BlockStack>
                            <ButtonGroup>
                              <Button icon={ExternalIcon} url={adminUrl} target="_blank">View in Admin</Button>
                              <Button icon={HideIcon} onClick={() => setIgnoredOrders([...ignoredOrders, order.id])}>Ignore</Button>
                            </ButtonGroup>
                          </InlineStack>

                          {isCritical && (
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                {order.stacking && <Text variant="bodySm">Combined: {order.appliedDiscounts.join(' + ')}</Text>}
                                {order.hasLoss && order.lossDetails.map((item, i) => (
                                  <Text key={i} variant="bodySm" tone="critical">• {item.title}: Sold below cost (${item.price} vs ${item.cost})</Text>
                                ))}
                                <Text variant="bodySm" fontWeight="bold" tone="critical">Profit Lost: ${order.orderLossToDiscounts.toFixed(2)}</Text>
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

          {/* BOTTOM SUMMARY BANNER */}
          <Layout.Section>
            <Banner tone="info" title="Audit Summary (Last 20 Orders)">
              <p>We identified <b>{stats.criticalCount}</b> orders with profit leaks. By fixing your discount stacking rules, you could have saved <b>${stats.totalLoss}</b> in margin.</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}