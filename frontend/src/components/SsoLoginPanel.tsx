import { Button, Typography, Space } from "antd";
import { useState } from "react";
import { getOidcLoginUrl } from "../api";
import { notify } from "../utils/notify";

export function SsoLoginPanel() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const data = await getOidcLoginUrl();
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        notify.error("OIDC is not configured.");
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to start SSO login.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical">
      <Typography.Text type="secondary">
        Sign in with your organization’s SSO provider.
      </Typography.Text>
      <Button type="primary" onClick={handleLogin} loading={loading}>
        Login with SSO
      </Button>
    </Space>
  );
}
