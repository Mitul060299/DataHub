import { Card, List, Rate, Form, Input, Button, Space, Typography, Avatar } from "antd";
import { useState } from "react";
import { notify } from "../utils/notify";

const initialReviews: Array<{ name: string; role: string; rating: number; comment: string }> = [];

export function ReviewsPanel() {
  const [reviews, setReviews] = useState(initialReviews);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="panel-card" title="Customer Reviews">
        <List
          itemLayout="horizontal"
          dataSource={reviews}
          locale={{ emptyText: "No customer reviews yet." }}
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
