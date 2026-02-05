import { Button, Input, Space } from "antd";
import { AudioOutlined, PaperClipOutlined, SendOutlined } from "@ant-design/icons";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export function AIChatInput({ value, onChange, onSend, disabled, placeholder }: Props) {
  return (
    <div className="ai-chat-input">
      <Input.TextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder={placeholder}
      />
      <div className="ai-chat-input-actions">
        <Space>
          <Button icon={<PaperClipOutlined />} type="text">
            Attach
          </Button>
          <Button icon={<AudioOutlined />} type="text">
            Voice
          </Button>
        </Space>
        <Button type="primary" icon={<SendOutlined />} onClick={onSend} disabled={disabled}>
          Send
        </Button>
      </div>
    </div>
  );
}
