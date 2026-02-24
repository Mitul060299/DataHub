import { Alert, Button, Form, Input, Select, Typography } from "antd";
import { GithubOutlined, GoogleOutlined, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { TopRibbon } from "../components/TopRibbon";
import "../AuthPages.css";

const { Title, Text } = Typography;

export function SignupPage() {
  const { signUpWithPassword, signInWithProvider, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate("/app", { replace: true });
    }
  }, [session, navigate]);

  const handleSubmit = async (values: {
    name: string;
    email: string;
    password: string;
    role: "analyst" | "engineer" | "manager" | "admin";
  }) => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await signUpWithPassword(
      values.email,
      values.password,
      values.name,
      values.role
    );
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage("Check your email to confirm your account.");
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
    <div className="auth-shell">
      <TopRibbon />
      <div className="auth-page">
        <div className="auth-grid">
          <div className="auth-hero">
            <span className="auth-kicker">Launch your workspace</span>
            <Title level={1}>Create your DataHub account</Title>
            <Text>
              Get instant access to AI-powered data import, governance, and collaboration tools.
            </Text>
          </div>
          <div className="auth-card">
            <Title level={2}>Sign up</Title>
            <Text type="secondary">Start with email or continue with a provider.</Text>
            {errorMessage && <Alert type="error" message={errorMessage} showIcon style={{ marginTop: 16 }} />}
            {successMessage && (
              <Alert type="success" message={successMessage} showIcon style={{ marginTop: 16 }} />
            )}
            <Form layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
              <Form.Item
                label="Full name"
                name="name"
                rules={[{ required: true, message: "Enter your name" }]}
              >
                <Input prefix={<UserOutlined />} placeholder="Alex Rivera" />
              </Form.Item>
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
                rules={[{ required: true, message: "Create a password" }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="At least 8 characters" />
              </Form.Item>
              <Form.Item
                label="Primary role"
                name="role"
                initialValue="analyst"
                rules={[{ required: true, message: "Choose your role" }]}
              >
                <Select
                  options={[
                    { label: "Analyst", value: "analyst" },
                    { label: "Engineer", value: "engineer" },
                    { label: "Manager", value: "manager" },
                    { label: "Admin", value: "admin" },
                  ]}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" className="auth-action" loading={loading}>
                Create account
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
                Already have an account? <Link className="auth-link" to="/login">Sign in</Link>
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
