import { Card, List, Rate, Form, Input, Button, Space, Typography, Avatar } from "antd";
import { useState } from "react";
import { notify } from "../utils/notify";

const initialReviews = [
  {
    name: "Priya N.",
    role: "Head of Analytics",
    rating: 5,
    comment: "DataHub reduced our dashboard delivery time by 60%.",
  },
  {
    name: "Carlos M.",
    role: "Data Platform Lead",
    rating: 4,
    comment: "Great governance controls and a smooth collaboration flow.",
  },
  {
    name: "Morgan S.",
    role: "Operations Manager",
    rating: 5,
    comment: "The AI copilot helps us spot issues faster than before.",
  },
];

export function ReviewsPanel() {
  const [reviews, setReviews] = useState(initialReviews);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="panel-card" title="Customer Reviews">
        <List
          itemLayout="horizontal"
          dataSource={reviews}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar>{item.name.charAt(0)}</Avatar>}
                title={
                  <Space>
                    <Typography.Text strong>{item.name}</Typography.Text>
                    <Typography.Text type="secondary">{item.role}</Typography.Text>
                  </Space>
                }
                description={
                  <Space direction="vertical">
                    <Rate disabled value={item.rating} />
                    <Typography.Paragraph>{item.comment}</Typography.Paragraph>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card className="panel-card" title="Share your experience">
        <Form
          layout="vertical"
          onFinish={(values) => {
            setReviews([
              {
                name: values.name,
                role: values.role,
                rating: values.rating,
                comment: values.comment,
              },
              ...reviews,
            ]);
            notify.success("Thanks for your review!");
          }}
        >
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="Your name" />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true }]}>
            <Input placeholder="Your role" />
          </Form.Item>
          <Form.Item label="Rating" name="rating" rules={[{ required: true }]}>
            <Rate />
          </Form.Item>
          <Form.Item label="Comment" name="comment" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Tell us what you love" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            Submit review
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
