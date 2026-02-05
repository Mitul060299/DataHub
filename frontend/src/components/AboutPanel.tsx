import { Card, Row, Col, Typography, Tag, Space } from "antd";

export function AboutPanel() {
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="panel-card" title="About DataHub">
        <Typography.Paragraph>
          DataHub is a modern analytics studio built to accelerate data-driven decisions. It combines
          smart ingestion, AI-assisted transformations, and governed collaboration into a single
          workspace.
        </Typography.Paragraph>
        <Space wrap>
          <Tag color="blue">Enterprise-ready</Tag>
          <Tag color="geekblue">Audit-first</Tag>
          <Tag color="green">Realtime collaboration</Tag>
          <Tag color="purple">AI Copilot</Tag>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={8}>
          <Card className="panel-card" title="Mission">
            <Typography.Paragraph>
              Help teams turn raw data into trusted decisions with governed, explainable AI.
            </Typography.Paragraph>
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card className="panel-card" title="Security & Compliance">
            <Typography.Paragraph>
              Built with SOC2-ready controls, fine-grained sharing, and audit trails.
            </Typography.Paragraph>
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card className="panel-card" title="Scale">
            <Typography.Paragraph>
              From SMB analytics to enterprise data governance with elastic compute and sync.
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
