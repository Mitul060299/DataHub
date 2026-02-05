import { Alert, Button, Card, Col, Row, Space, Table, Tag, Typography } from "antd";

const columns = [
  { title: "Order", dataIndex: "order", key: "order" },
  { title: "Product", dataIndex: "product", key: "product" },
  { title: "Qty", dataIndex: "qty", key: "qty" },
  { title: "Revenue", dataIndex: "revenue", key: "revenue" },
  { title: "Date", dataIndex: "date", key: "date" },
];

const data = [
  { key: 1, order: "#1001", product: "Widget A", qty: 5, revenue: "$250", date: "Jan 1" },
  { key: 2, order: "#1002", product: "Gadget B", qty: 2, revenue: "$180", date: "Jan 1" },
  { key: 3, order: "#1003", product: "Widget A", qty: 1, revenue: "$50", date: "Jan 2" },
];

export function DemoPanel() {
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert
        message="Demo Mode"
        description="You are exploring a guided demo workspace. Sign up to save your changes."
        type="warning"
        showIcon
        action={<Button type="primary">Sign Up</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card className="panel-card" title="Sample Dataset: sales_2024.csv">
            <Table columns={columns} dataSource={data} pagination={false} size="small" />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="panel-card" title="AI Demo Insights">
            <Space direction="vertical">
              <Typography.Text>💡 23% of orders have missing shipping zones.</Typography.Text>
              <Typography.Text>📈 Revenue is up 12% week-over-week.</Typography.Text>
              <Typography.Text>🧹 Suggested cleanup: Normalize product names.</Typography.Text>
              <Tag color="blue">Try: “Show top products”</Tag>
            </Space>
          </Card>
          <Card className="panel-card" title="Guided Tour" style={{ marginTop: 16 }}>
            <Typography.Text type="secondary">Step 3/7 • Preview data quality</Typography.Text>
            <div style={{ marginTop: 12 }}>
              <Button type="primary">Next Step</Button>
              <Button style={{ marginLeft: 8 }}>Skip Tour</Button>
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
