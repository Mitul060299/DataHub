import { Button, Card, Col, Radio, Row, Space, Tag, Typography } from "antd";
import { useState } from "react";

type Props = {
  onSelectPlan: (plan: string) => void;
};

const planData = {
  monthly: [
    { name: "Free", price: "$0", period: "/mo", features: ["Basic dashboards", "3 datasets", "1 user"] },
    { name: "Pro", price: "$49", period: "/user/mo", features: ["Unlimited datasets", "AI insights", "API access"], popular: true },
    { name: "Business", price: "$199", period: "/user/mo", features: ["SSO", "RBAC", "Audit logs"], },
    { name: "Enterprise", price: "Custom", period: "", features: ["SLA", "On-prem", "Custom connectors"], },
  ],
  yearly: [
    { name: "Free", price: "$0", period: "/mo", features: ["Basic dashboards", "3 datasets", "1 user"] },
    { name: "Pro", price: "$39", period: "/user/mo", features: ["Unlimited datasets", "AI insights", "API access"], popular: true },
    { name: "Business", price: "$159", period: "/user/mo", features: ["SSO", "RBAC", "Audit logs"], },
    { name: "Enterprise", price: "Custom", period: "", features: ["SLA", "On-prem", "Custom connectors"], },
  ],
};

export function PlansPanel({ onSelectPlan }: Props) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Choose Your Plan</Typography.Title>
        <Radio.Group value={billing} onChange={(e) => setBilling(e.target.value)}>
          <Radio.Button value="monthly">Monthly</Radio.Button>
          <Radio.Button value="yearly">Yearly -20%</Radio.Button>
        </Radio.Group>
      </Space>
      <Row gutter={[16, 16]}>
        {planData[billing].map((plan) => (
          <Col key={plan.name} xs={24} md={12} lg={6}>
            <Card className={plan.popular ? "pricing-card pricing-card--accent" : "pricing-card"}>
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                <Space align="center">
                  <Typography.Title level={4} style={{ marginBottom: 0 }}>{plan.name}</Typography.Title>
                  {plan.popular && <Tag color="blue">POPULAR</Tag>}
                </Space>
                <Typography.Title level={2} style={{ margin: 0 }}>{plan.price}</Typography.Title>
                <Typography.Text type="secondary">{plan.period}</Typography.Text>
                <Space direction="vertical">
                  {plan.features.map((item) => (
                    <Typography.Text key={item}>✓ {item}</Typography.Text>
                  ))}
                </Space>
                <Button type={plan.popular ? "primary" : "default"} onClick={() => onSelectPlan(plan.name)}>
                  {plan.name === "Enterprise" ? "Contact" : "Select"}
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
