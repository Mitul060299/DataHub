import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Input,
  Modal,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  GithubOutlined,
  GoogleOutlined,
  LockOutlined,
  MailOutlined,
  WindowsOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { notify } from "../utils/notify";
import { supabase } from "../utils/supabaseClient";
import { setAuthToken } from "../utils/auth";

type Props = {
  onSelectTab: (key: string) => void;
};

type AuthView =
  | "signIn"
  | "signUp"
  | "verifyEmail"
  | "welcome"
  | "forgotPassword"
  | "checkEmail"
  | "resetPassword"
  | "sso";

const emailSchema = z.string().email({ message: "Enter a valid email address" });
const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .regex(/[A-Z]/, { message: "Include at least one uppercase letter" })
  .regex(/\d/, { message: "Include at least one number" });

const features = [
  {
    title: "Connect Anything",
    description: "Import CSV, databases, and SaaS data in minutes.",
  },
  {
    title: "AI Clean Auto",
    description: "Auto-detect issues and apply trusted recipes.",
  },
  {
    title: "Insights Instant",
    description: "Get correlation, trends, and summaries fast.",
  },
];

const pricing = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    highlights: ["Basic dashboards", "3 datasets", "1 user"],
    cta: "Start Free",
  },
  {
    name: "Pro",
    price: "$49",
    period: "/user",
    highlights: ["Unlimited datasets", "AI insights", "API access"],
    cta: "Start Pro",
    accent: true,
  },
  {
    name: "Business",
    price: "$199",
    period: "/user",
    highlights: ["SSO", "RBAC", "Audit logs"],
    cta: "Upgrade",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    highlights: ["SLA", "On-prem", "Custom connectors"],
    cta: "Contact",
  },
];

const testimonials = [
  {
    quote: "We shipped our analytics workflows 3x faster with DataHub.",
    name: "Priya N.",
    company: "Nimbus Retail",
  },
  {
    quote: "The AI copilot surfaces insights our teams missed before.",
    name: "Carlos M.",
    company: "FinSight",
  },
  {
    quote: "Audit-ready governance without slowing down the team.",
    name: "Morgan S.",
    company: "OpsHub",
  },
];

export function LandingPanel({ onSelectTab }: Props) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("signIn");
  const [authLoading, setAuthLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirm, setSignUpConfirm] = useState("");
  const [verificationCode, setVerificationCode] = useState<string[]>(Array(6).fill(""));
  const [resendSeconds, setResendSeconds] = useState(60);
  const [ssoDomain, setSsoDomain] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  const signInEmailError = useMemo(() => {
    if (!signInEmail) return null;
    const result = emailSchema.safeParse(signInEmail);
    return result.success ? null : result.error.errors[0]?.message;
  }, [signInEmail]);

  const signInPasswordError = useMemo(() => {
    if (!signInPassword) return null;
    const result = z.string().min(8, { message: "Password must be at least 8 characters" }).safeParse(signInPassword);
    return result.success ? null : result.error.errors[0]?.message;
  }, [signInPassword]);

  const signUpEmailError = useMemo(() => {
    if (!signUpEmail) return null;
    const result = emailSchema.safeParse(signUpEmail);
    return result.success ? null : result.error.errors[0]?.message;
  }, [signUpEmail]);

  const signUpPasswordErrors = useMemo(() => {
    if (!signUpPassword) return [] as string[];
    const result = passwordSchema.safeParse(signUpPassword);
    if (result.success) return [];
    return result.error.errors.map((err) => err.message);
  }, [signUpPassword]);

  const signUpConfirmError = useMemo(() => {
    if (!signUpConfirm) return null;
    return signUpConfirm !== signUpPassword ? "Passwords don't match" : null;
  }, [signUpConfirm, signUpPassword]);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (signUpPassword.length >= 8) score += 40;
    if (/[A-Z]/.test(signUpPassword)) score += 30;
    if (/\d/.test(signUpPassword)) score += 30;
    return Math.min(100, score);
  }, [signUpPassword]);

  const canSignIn = Boolean(signInEmail && signInPassword && !signInEmailError && !signInPasswordError);
  const canSignUp =
    Boolean(signUpName && signUpEmail && signUpPassword && signUpConfirm && termsAccepted) &&
    !signUpEmailError &&
    signUpPasswordErrors.length === 0 &&
    !signUpConfirmError;

  const openSignIn = () => {
    setAuthView("signIn");
    setAuthOpen(true);
  };

  const openSignUp = () => {
    setAuthView("signUp");
    setAuthOpen(true);
  };

  const handleSignIn = async () => {
    if (!canSignIn) return;
    setAuthLoading(true);
    setSignInError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: signInPassword
    });
    if (error) {
      setAuthLoading(false);
      setSignInError(error.message);
      return;
    }
    const accessToken = data.session?.access_token;
    if (accessToken) {
      setAuthToken(accessToken);
    }
    setAuthLoading(false);
    notify.success("Signed in successfully");
    setAuthOpen(false);
    onSelectTab("home");
  };

  const handleSignUp = async () => {
    if (!canSignUp) return;
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: signUpEmail,
      password: signUpPassword,
      options: {
        data: {
          full_name: signUpName
        }
      }
    });
    if (error) {
      setAuthLoading(false);
      notify.error(error.message);
      return;
    }
    const accessToken = data.session?.access_token;
    if (accessToken) {
      setAuthToken(accessToken);
      setAuthLoading(false);
      setAuthView("welcome");
      return;
    }
    setAuthLoading(false);
    setAuthView("checkEmail");
    notify.success("Check your email to confirm your account");
  };

  const handleVerify = () => {
    if (verificationCode.join("").length !== 6) return;
    setAuthView("welcome");
  };

  const handleResend = () => {
    if (resendSeconds > 0) return;
    setResendSeconds(60);
    notify.success("Verification code resent");
  };

  const handleOAuth = async (provider: "google" | "github" | "azure") => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) {
      notify.error(error.message);
    }
    setAuthLoading(false);
  };

  const handleSso = async () => {
    if (!ssoDomain.trim()) {
      notify.error("Enter your company domain");
      return;
    }
    setAuthLoading(true);
    const auth = supabase.auth as unknown as {
      signInWithSSO?: (payload: { domain: string }) => Promise<{ error?: { message: string } }>;
    };
    if (!auth.signInWithSSO) {
      notify.info("SSO is not enabled for this project");
      setAuthLoading(false);
      return;
    }
    const { error } = await auth.signInWithSSO({ domain: ssoDomain.trim() });
    if (error) {
      notify.error(error.message);
    }
    setAuthLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      notify.error("Enter your email to reset the password");
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin
    });
    setAuthLoading(false);
    if (error) {
      notify.error(error.message);
      return;
    }
    setAuthView("checkEmail");
    notify.success("Password reset link sent");
  };

  const handleResetPassword = async () => {
    if (!resetPassword || resetPassword !== resetConfirm) {
      notify.error("Passwords do not match");
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.updateUser({ password: resetPassword });
    setAuthLoading(false);
    if (error) {
      notify.error(error.message);
      return;
    }
    notify.success("Password updated");
    setAuthView("signIn");
  };

  const renderSignIn = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Welcome back</Typography.Title>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Button className="auth-social google" icon={<GoogleOutlined />} block onClick={() => handleOAuth("google")}>
          Continue with Google
        </Button>
        <Button className="auth-social microsoft" icon={<WindowsOutlined />} block onClick={() => handleOAuth("azure")}>
          Continue with Microsoft
        </Button>
        <Button className="auth-social github" icon={<GithubOutlined />} block onClick={() => handleOAuth("github")}>
          Continue with GitHub
        </Button>
        <Button className="auth-social" icon={<LockOutlined />} block onClick={() => setAuthView("sso")}>
          Continue with SSO
        </Button>
      </Space>
      <Divider>or</Divider>
      {signInError && <Alert type="error" message={signInError} showIcon />}
      <Input
        autoFocus
        prefix={<MailOutlined />}
        placeholder="Email"
        value={signInEmail}
        onChange={(event) => setSignInEmail(event.target.value)}
        status={signInEmailError ? "error" : ""}
      />
      {signInEmailError && <Typography.Text type="danger">{signInEmailError}</Typography.Text>}
      <Input.Password
        prefix={<LockOutlined />}
        placeholder="Password"
        value={signInPassword}
        onChange={(event) => setSignInPassword(event.target.value)}
        iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
        status={signInPasswordError ? "error" : ""}
      />
      {signInPasswordError && <Typography.Text type="danger">{signInPasswordError}</Typography.Text>}
      <div className="auth-row">
        <Checkbox checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)}>
          Remember me
        </Checkbox>
        <Button type="link" onClick={() => setAuthView("forgotPassword")}>
          Forgot password?
        </Button>
      </div>
      <Button type="primary" block loading={authLoading} disabled={!canSignIn} onClick={handleSignIn}>
        Sign In
      </Button>
      <Typography.Text>
        Don&apos;t have an account? <Button type="link" onClick={openSignUp}>Sign up</Button>
      </Typography.Text>
    </Space>
  );

  const renderSignUp = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Create your account</Typography.Title>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Button className="auth-social google" icon={<GoogleOutlined />} block onClick={() => handleOAuth("google")}>
          Continue with Google
        </Button>
        <Button className="auth-social microsoft" icon={<WindowsOutlined />} block onClick={() => handleOAuth("azure")}>
          Continue with Microsoft
        </Button>
        <Button className="auth-social github" icon={<GithubOutlined />} block onClick={() => handleOAuth("github")}>
          Continue with GitHub
        </Button>
      </Space>
      <Divider>or</Divider>
      <Input placeholder="Full name" value={signUpName} onChange={(event) => setSignUpName(event.target.value)} />
      <Input
        prefix={<MailOutlined />}
        placeholder="Email"
        value={signUpEmail}
        onChange={(event) => setSignUpEmail(event.target.value)}
        status={signUpEmailError ? "error" : ""}
      />
      {signUpEmailError && <Typography.Text type="danger">{signUpEmailError}</Typography.Text>}
      <Input.Password
        prefix={<LockOutlined />}
        placeholder="Password"
        value={signUpPassword}
        onChange={(event) => setSignUpPassword(event.target.value)}
        iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
      />
      <Progress percent={passwordStrength} status={passwordStrength > 80 ? "success" : "active"} />
      <div className="password-checklist">
        <Typography.Text type={signUpPassword.length >= 8 ? "success" : "secondary"}>✓ At least 8 characters</Typography.Text>
        <Typography.Text type={/[A-Z]/.test(signUpPassword) ? "success" : "secondary"}>✓ Contains uppercase letter</Typography.Text>
        <Typography.Text type={/\d/.test(signUpPassword) ? "success" : "secondary"}>✓ Contains a number</Typography.Text>
      </div>
      {signUpPasswordErrors.length > 0 && <Typography.Text type="danger">{signUpPasswordErrors[0]}</Typography.Text>}
      <Input.Password
        placeholder="Confirm password"
        value={signUpConfirm}
        onChange={(event) => setSignUpConfirm(event.target.value)}
        iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
        status={signUpConfirmError ? "error" : ""}
      />
      {signUpConfirmError && <Typography.Text type="danger">{signUpConfirmError}</Typography.Text>}
      <Checkbox checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)}>
        By signing up, you agree to our <Button type="link">Terms</Button> and <Button type="link">Privacy Policy</Button>
      </Checkbox>
      <Button type="primary" block disabled={!canSignUp} loading={authLoading} onClick={handleSignUp}>
        Create Account
      </Button>
      <Typography.Text>
        Already have an account? <Button type="link" onClick={openSignIn}>Sign in</Button>
      </Typography.Text>
    </Space>
  );

  const renderVerifyEmail = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Check your email</Typography.Title>
      <Typography.Text type="secondary">We sent a verification code to {signUpEmail || "your@email.com"}</Typography.Text>
      <div className="code-inputs">
        {verificationCode.map((value, index) => (
          <Input
            key={`code-${index}`}
            value={value}
            maxLength={1}
            className="code-input"
            onChange={(event) => {
              const next = [...verificationCode];
              next[index] = event.target.value.replace(/\D/g, "");
              setVerificationCode(next);
            }}
          />
        ))}
      </div>
      <Button type="primary" block onClick={handleVerify}>
        Verify
      </Button>
      <Button type="link" onClick={() => setAuthView("signUp")}>Change email</Button>
      <Button type="link" disabled={resendSeconds > 0} onClick={handleResend}>
        Didn&apos;t receive it? Resend {resendSeconds > 0 ? `(${resendSeconds}s)` : ""}
      </Button>
    </Space>
  );

  const renderWelcome = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div className="confetti">🎉</div>
      <Typography.Title level={4}>Welcome to DataHub!</Typography.Title>
      <Typography.Text type="secondary">Your account is ready. Let&apos;s set up your workspace.</Typography.Text>
      <Button type="primary" block onClick={() => { setAuthOpen(false); onSelectTab("workspace"); }}>
        Get Started
      </Button>
    </Space>
  );

  const renderForgotPassword = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Reset your password</Typography.Title>
      <Input
        prefix={<MailOutlined />}
        placeholder="Email"
        value={forgotEmail}
        onChange={(event) => setForgotEmail(event.target.value)}
      />
      <Button type="primary" block onClick={handleForgotPassword} loading={authLoading}>Send reset link</Button>
      <Button type="link" onClick={openSignIn}>Back to sign in</Button>
    </Space>
  );

  const renderCheckEmail = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Check your email</Typography.Title>
      <Typography.Text type="secondary">If an account exists, you&apos;ll receive reset instructions.</Typography.Text>
      <Button type="primary" block onClick={openSignIn}>Back to sign in</Button>
    </Space>
  );

  const renderResetPassword = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Create new password</Typography.Title>
      <Input.Password
        placeholder="New password"
        value={resetPassword}
        onChange={(event) => setResetPassword(event.target.value)}
      />
      <Input.Password
        placeholder="Confirm password"
        value={resetConfirm}
        onChange={(event) => setResetConfirm(event.target.value)}
      />
      <Button type="primary" block onClick={handleResetPassword} loading={authLoading}>Reset Password</Button>
    </Space>
  );

  const renderSSO = () => (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4}>Continue with SSO</Typography.Title>
      <Input placeholder="Company domain" value={ssoDomain} onChange={(event) => setSsoDomain(event.target.value)} />
      <Button type="primary" block onClick={handleSso} loading={authLoading}>Continue</Button>
      <Button type="link" onClick={openSignIn}>Back to sign in</Button>
    </Space>
  );

  useEffect(() => {
    if (authView === "verifyEmail" && resendSeconds > 0) {
      const timer = window.setTimeout(() => setResendSeconds((prev) => prev - 1), 1000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [authView, resendSeconds]);
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div className="hero">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={12}>
            <Tag color="blue">AI Analytics Studio</Tag>
            <Typography.Title level={1} style={{ marginTop: 12 }}>
              Clean, Analyze, and Share Your Data with AI-Powered Insights
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              Move from raw data to trusted decisions faster. Build governed pipelines, collaborate in real time, and
              publish dashboards your team trusts.
            </Typography.Paragraph>
            <Space size="middle" wrap>
              <Button type="primary" size="large" onClick={openSignUp}>
                Get Started Free
              </Button>
              <Button size="large" onClick={openSignIn}>
                Sign In
              </Button>
              <Button size="large" onClick={() => onSelectTab("demo")}>
                Watch Demo
              </Button>
              <Button size="large" type="link" onClick={() => onSelectTab("plans")}
              >
                View Plans
              </Button>
            </Space>
          </Col>
          <Col xs={24} lg={12}>
            <Card className="hero-card" title="Live Workspace Preview">
              <Typography.Paragraph>
                A modern dashboard experience with AI suggestions, collaboration, and real-time metrics.
              </Typography.Paragraph>
              <div className="hero-preview" />
            </Card>
          </Col>
        </Row>
      </div>

      <div className="section">
        <Typography.Title level={3}>Why Teams Choose DataHub</Typography.Title>
        <Row gutter={[16, 16]}>
          {features.map((feature) => (
            <Col key={feature.title} xs={24} md={8}>
              <Card className="feature-card" hoverable>
                <Typography.Title level={4}>{feature.title}</Typography.Title>
                <Typography.Paragraph type="secondary">{feature.description}</Typography.Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <div className="section">
        <Typography.Title level={3}>Choose Your Plan</Typography.Title>
        <Row gutter={[16, 16]}>
          {pricing.map((plan) => (
            <Col key={plan.name} xs={24} md={12} lg={6}>
              <Card className={plan.accent ? "pricing-card pricing-card--accent" : "pricing-card"}>
                <Space direction="vertical" size="small" style={{ width: "100%" }}>
                  <Space align="center">
                    <Typography.Title level={4} style={{ marginBottom: 0 }}>
                      {plan.name}
                    </Typography.Title>
                    {plan.accent && <Tag color="blue">Most Popular</Tag>}
                  </Space>
                  <Typography.Title level={2} style={{ margin: 0 }}>
                    {plan.price}
                  </Typography.Title>
                  <Typography.Text type="secondary">{plan.period}</Typography.Text>
                  <Divider />
                  <Space direction="vertical">
                    {plan.highlights.map((item) => (
                      <Typography.Text key={item}>✓ {item}</Typography.Text>
                    ))}
                  </Space>
                  <Button type={plan.accent ? "primary" : "default"} onClick={() => onSelectTab("plans")}
                  >
                    {plan.cta}
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <div className="section">
        <Typography.Title level={3}>Trusted by Modern Teams</Typography.Title>
        <Row gutter={[16, 16]}>
          {testimonials.map((item) => (
            <Col key={item.name} xs={24} md={8}>
              <Card className="panel-card">
                <Typography.Paragraph>“{item.quote}”</Typography.Paragraph>
                <Typography.Text strong>{item.name}</Typography.Text>
                <br />
                <Typography.Text type="secondary">{item.company}</Typography.Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Divider />
      <div className="footer">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Typography.Text strong>Product</Typography.Text>
            <Space direction="vertical">
              <Button type="link" onClick={() => onSelectTab("import")}>Features</Button>
              <Button type="link" onClick={() => onSelectTab("plans")}>Pricing</Button>
              <Button type="link" onClick={() => onSelectTab("demo")}>Demo</Button>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text strong>Company</Typography.Text>
            <Space direction="vertical">
              <Button type="link" onClick={() => onSelectTab("about")}>About</Button>
              <Button type="link">Careers</Button>
              <Button type="link">Blog</Button>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text strong>Resources</Typography.Text>
            <Space direction="vertical">
              <Button type="link">Docs</Button>
              <Button type="link">API</Button>
              <Button type="link">Support</Button>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text strong>Legal</Typography.Text>
            <Space direction="vertical">
              <Button type="link">Privacy</Button>
              <Button type="link">Terms</Button>
              <Button type="link">Security</Button>
            </Space>
          </Col>
        </Row>
        <Divider />
        <Typography.Text type="secondary">© 2026 DataHub. All rights reserved.</Typography.Text>
      </div>

      <Modal
        open={authOpen}
        onCancel={() => setAuthOpen(false)}
        footer={null}
        width={440}
        className="auth-modal"
        centered
        destroyOnClose
      >
        {authView === "signIn" && renderSignIn()}
        {authView === "signUp" && renderSignUp()}
        {authView === "verifyEmail" && renderVerifyEmail()}
        {authView === "welcome" && renderWelcome()}
        {authView === "forgotPassword" && renderForgotPassword()}
        {authView === "checkEmail" && renderCheckEmail()}
        {authView === "resetPassword" && renderResetPassword()}
        {authView === "sso" && renderSSO()}
      </Modal>
    </Space>
  );
}
