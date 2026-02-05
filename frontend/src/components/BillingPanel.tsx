import { Button, Card, Col, Form, Input, Row, Select, Space, Typography } from "antd";

type Props = {
  selectedPlan: string;
};

export function BillingPanel({ selectedPlan }: Props) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card className="panel-card" title="Payment Details">
          <Form layout="vertical">
            <Form.Item label="Card number">
              <Input placeholder="1234 5678 9012 3456" />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={12}>
                <Form.Item label="Expiry">
                  <Input placeholder="MM/YY" />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item label="CVV">
                  <Input placeholder="123" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Name on card">
              <Input placeholder="Name" />
            </Form.Item>
            <Form.Item label="Billing address">
              <Input placeholder="Street address" />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={12}>
                <Form.Item label="City">
                  <Input placeholder="City" />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item label="Postal code">
                  <Input placeholder="Postal code" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Country">
              <Select
                options={[
                  { value: "IN", label: "India" },
                  { value: "US", label: "United States" },
                  { value: "GB", label: "United Kingdom" },
                ]}
              />
            </Form.Item>
            <Button type="primary">Subscribe now</Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card className="panel-card" title="Order Summary">
          <Space direction="vertical">
            <Typography.Text>Plan: {selectedPlan}</Typography.Text>
            <Typography.Text type="secondary">Seats: 2</Typography.Text>
            <Typography.Title level={3} style={{ margin: 0 }}>$115.64</Typography.Title>
            <Typography.Text type="secondary">Total per month (incl. taxes)</Typography.Text>
            <Typography.Paragraph type="secondary">
              Billed monthly until canceled. Secure payments handled by Stripe.
            </Typography.Paragraph>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}
