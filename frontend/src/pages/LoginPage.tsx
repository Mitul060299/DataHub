import { Alert, Button, Form, Input, Typography } from "antd";
import { GithubOutlined, GoogleOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../AuthPages.css";

const { Title, Text } = Typography;

type LocationState = {
  from?: { pathname?: string };
};

export function LoginPage() {
  const { signInWithPassword, signInWithProvider, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const destination = state?.from?.pathname ?? "/app";

  useEffect(() => {
    if (session) {
      navigate(destination, { replace: true });
    }
  }, [session, destination, navigate]);

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);
    setErrorMessage(null);
    const { error } = await signInWithPassword(values.email, values.password);
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    navigate(destination, { replace: true });
  };

  const handleProvider = async (provider: "google" | "github") => {
    setLoading(true);
    const { error } = await signInWithProvider(provider);
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <div className="auth-hero">
          <span className="auth-kicker">AI data ops, aligned</span>
          <Title level={1}>Welcome back to DataHub</Title>
          <Text>
            Sign in to continue orchestrating datasets, workflows, and AI insights across your workspace.
          </Text>
        </div>
        <div className="auth-card">
          <Title level={2}>Sign in</Title>
          <Text type="secondary">Use your work email or a trusted provider.</Text>
          {errorMessage && <Alert type="error" message={errorMessage} showIcon style={{ marginTop: 16 }} />}
          <Form layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
            <Form.Item
              label="Email"
              name="email"
              rules={[{ required: true, message: "Enter your email" }]}
            >
              <Input prefix={<MailOutlined />} placeholder="you@company.com" />
            </Form.Item>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: "Enter your password" }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Your password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" className="auth-action" loading={loading}>
              Sign in
            </Button>
          </Form>
          <div className="auth-divider">or continue with</div>
          <Button
            icon={<GoogleOutlined />}
            className="auth-secondary"
            onClick={() => handleProvider("google")}
          >
            Google
          </Button>
          <Button
            icon={<GithubOutlined />}
            className="auth-secondary"
            onClick={() => handleProvider("github")}
            style={{ marginTop: 12 }}
          >
            GitHub
          </Button>
          <div className="auth-footer">
            <Text>
              New to DataHub? <Link className="auth-link" to="/signup">Create an account</Link>
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
