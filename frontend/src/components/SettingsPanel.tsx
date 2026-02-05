import { Card, Row, Col, Form, Input, Select, Switch, Button, Divider, Typography, List, Tag } from "antd";
import { useState } from "react";
import { notify } from "../utils/notify";

const plans = [
  { value: "starter", label: "Starter", price: "$49 / month" },
  { value: "growth", label: "Growth", price: "$149 / month" },
  { value: "enterprise", label: "Enterprise", price: "Contact sales" },
];

export function SettingsPanel() {
  const [plan, setPlan] = useState("growth");
  const [mfaEnabled, setMfaEnabled] = useState(false);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card className="panel-card" title="Account Profile">
          <Form
            layout="vertical"
            onFinish={() => notify.success("Account settings saved")}
            initialValues={{
              name: "Mitul Shah",
              email: "mitul@datahub.org.in",
              company: "DataHub Labs",
              timezone: "Asia/Kolkata",
            }}
          >
            <Form.Item label="Full name" name="name">
              <Input placeholder="Full name" />
            </Form.Item>
            <Form.Item label="Email" name="email">
              <Input placeholder="Email" />
            </Form.Item>
            <Form.Item label="Company" name="company">
              <Input placeholder="Company" />
            </Form.Item>
            <Form.Item label="Timezone" name="timezone">
              <Select
                options={[
                  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
                  { value: "America/New_York", label: "America/New_York" },
                  { value: "Europe/London", label: "Europe/London" },
                ]}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              Save changes
            </Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card className="panel-card" title="Subscription & Billing">
          <Typography.Text type="secondary">Current plan</Typography.Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <Select
              value={plan}
              onChange={setPlan}
              options={plans}
              style={{ width: "100%" }}
            />
          </div>
          <List
            bordered
            dataSource={[
              "Unlimited dashboards",
              "Priority AI compute",
              "SOC2-ready audit logs",
              "Dedicated workspace limits",
            ]}
            renderItem={(item) => (
              <List.Item>
                <Tag color="blue">Included</Tag>
                {item}
              </List.Item>
            )}
          />
          <Divider />
          <Typography.Text type="secondary">Billing contact</Typography.Text>
          <Form
            layout="vertical"
            onFinish={() => notify.success("Billing details saved")}
            initialValues={{ billingEmail: "billing@datahub.org.in" }}
          >
            <Form.Item label="Billing email" name="billingEmail">
              <Input placeholder="Billing email" />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              Update billing
            </Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24}>
        <Card className="panel-card" title="Security">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <Typography.Text strong>Multi-factor authentication</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Switch checked={mfaEnabled} onChange={setMfaEnabled} />
                <Typography.Text style={{ marginLeft: 12 }}>
                  {mfaEnabled ? "Enabled" : "Disabled"}
                </Typography.Text>
              </div>
            </Col>
            <Col xs={24} lg={8}>
              <Typography.Text strong>API tokens</Typography.Text>
              <Typography.Paragraph type="secondary">
                Rotate tokens regularly to keep integrations secure.
              </Typography.Paragraph>
              <Button onClick={() => notify.info("Token rotation initiated")}>Rotate tokens</Button>
            </Col>
            <Col xs={24} lg={8}>
              <Typography.Text strong>Data retention</Typography.Text>
              <Typography.Paragraph type="secondary">
                Default retention policy: 180 days.
              </Typography.Paragraph>
              <Button onClick={() => notify.success("Retention policy updated")}>Adjust policy</Button>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
}
