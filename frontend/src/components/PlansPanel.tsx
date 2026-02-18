import { Button, Card, Col, Radio, Row, Space, Tag, Typography } from "antd";
import { useState } from "react";

type Props = {
  onSelectPlan: (plan: string) => void;
};

const planData = {
  monthly: [
    { name: "Free", price: "$0", period: "/mo", features: ["100 MB storage", "50 AI messages/mo", "1 workspace", "CSV/Excel only", "50 MB file size", "Community support"], popular: false },
    { name: "Professional", price: "$79", period: "/user/mo", features: ["10 GB storage", "500 AI messages/mo", "3 workspaces", "Database access", "1 GB file upload", "Email support"], popular: true },
    { name: "Team", price: "$149", period: "/user/mo", features: ["100 GB shared storage", "Unlimited AI (fair use)", "Unlimited workspaces", "Snowflake, BigQuery", "5 GB file upload", "Priority support"], popular: false },
    { name: "Business", price: "$249", period: "/user/mo", features: ["1 TB shared storage", "Unlimited AI (managed)", "SSO + advanced RBAC", "Full audit trail", "10 GB file upload", "Success manager + 4h SLA"] },
    { name: "Enterprise", price: "Custom", period: "", features: ["Unlimited storage", "Custom AI limits", "On-premise option", "White-label", "Custom integrations", "24/7 dedicated support"] },
  ],
  yearly: [
    { name: "Free", price: "$0", period: "/mo", features: ["100 MB storage", "50 AI messages/mo", "1 workspace", "CSV/Excel only", "50 MB file size", "Community support"], popular: false },
    { name: "Professional", price: "$63", period: "/user/mo", features: ["10 GB storage", "500 AI messages/mo", "3 workspaces", "Database access", "1 GB file upload", "Email support"], popular: true },
    { name: "Team", price: "$119", period: "/user/mo", features: ["100 GB shared storage", "Unlimited AI (fair use)", "Unlimited workspaces", "Snowflake, BigQuery", "5 GB file upload", "Priority support"], popular: false },
    { name: "Business", price: "$199", period: "/user/mo", features: ["1 TB shared storage", "Unlimited AI (managed)", "SSO + advanced RBAC", "Full audit trail", "10 GB file upload", "Success manager + 4h SLA"] },
    { name: "Enterprise", price: "Custom", period: "", features: ["Unlimited storage", "Custom AI limits", "On-premise option", "White-label", "Custom integrations", "24/7 dedicated support"] },
  ],
};
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
