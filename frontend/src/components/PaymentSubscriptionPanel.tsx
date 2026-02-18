import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CreditCardOutlined,
  EuroOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { notify } from "../utils/notify";

const { Text, Title } = Typography;

const PLAN_FEATURES: Record<string, string[]> = {
  Free: ["Storage: 100 MB", "AI messages: 50/mo", "Workspaces: 1", "Projects/workspace: 2", "Datasets/project: 3", "File size: 50 MB"],
  Professional: ["Storage: 10 GB per user", "AI messages: 500/mo", "Workspaces: 3", "Projects/workspace: 10", "Datasets/project: 25", "File size: 1 GB", "Database connections", "Email support"],
  Team: ["Storage: 100 GB shared", "AI messages: Unlimited (fair use)", "Workspaces: Unlimited", "Projects/workspace: Unlimited", "Datasets/project: Unlimited", "File size: 5 GB", "Enterprise connectors", "Priority support (4h)"],
  Business: ["Storage: 1 TB shared", "AI messages: Unlimited", "SSO + Advanced RBAC", "Full audit trail", "File size: 10 GB", "Success manager + 4h SLA"],
  Enterprise: ["Storage: Unlimited", "AI messages: Custom limits", "On-premise option", "White-label", "Custom integrations", "24/7 dedicated support"],
};

const INVOICE_DATA = Array.from({ length: 6 }).map((_, index) => ({
  key: index + 1,
  invoice: `INV-2026-0${index + 1}`,
  date: `Feb ${index + 2}, 2026`,
  amount: `$${(98 + index * 12).toFixed(2)}`,
  status: index % 2 === 0 ? "Paid" : "Pending",
}));

const PAYMENT_METHODS = [
  { id: "card-1", brand: "Visa", last4: "4242", exp: "12/26", isDefault: true },
  { id: "card-2", brand: "Mastercard", last4: "5319", exp: "08/25", isDefault: false },
];

export function PaymentSubscriptionPanel() {
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState("Professional");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [seatCount, setSeatCount] = useState(3);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [savePayment, setSavePayment] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [planChangeOpen, setPlanChangeOpen] = useState(false);
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [trialBanner, setTrialBanner] = useState(true);
  const [paymentFailed, setPaymentFailed] = useState(false);

  const planPrice = selectedPlan === "Free"
    ? 0
    : selectedPlan === "Professional"
      ? 79
      : selectedPlan === "Team"
        ? 149
        : 249;
  const seatPrice = selectedPlan === "Business" ? 249 : selectedPlan === "Enterprise" ? 0 : 0;
  const seatsTotal = selectedPlan === "Business" ? seatCount * seatPrice : planPrice;
  const discount = promoStatus === "valid" ? 0.2 : 0;
  const subtotal = seatsTotal * (1 - discount);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  const orderSummary = useMemo(
    () => [
      { label: "Plan", value: `$${planPrice}/${billingCycle === "monthly" ? "month" : "year"}` },
      selectedPlan === "Business"
        ? { label: "Seats", value: `${seatCount} × $${seatPrice} = $${seatCount * seatPrice}` }
        : null,
      { label: "Subtotal", value: `$${subtotal.toFixed(2)}` },
      { label: "Tax", value: `$${tax.toFixed(2)}` },
      { label: "Total", value: `$${total.toFixed(2)}/${billingCycle === "monthly" ? "month" : "year"}` },
    ].filter(Boolean),
    [billingCycle, planPrice, seatCount, seatPrice, selectedPlan, subtotal, tax, total]
  );

  const applyPromo = () => {
    if (promoCode.toLowerCase() === "save20") {
      setPromoStatus("valid");
      notify.success("Promo code applied");
    } else {
      setPromoStatus("invalid");
    }
  };

  return (
    <div className="billing-root">
      {trialBanner && (
        <Alert
          type="warning"
          message="Your trial ends in 3 days"
          action={
            <Button type="primary" size="small" onClick={() => setCheckoutStep(0)}>
              Upgrade Now
            </Button>
          }
          closable
          onClose={() => setTrialBanner(false)}
          showIcon
        />
      )}
      {paymentFailed && (
        <Alert
          type="error"
          message="Payment failed. Please update your payment method"
          action={<Button size="small" onClick={() => setAddPaymentOpen(true)}>Update Payment</Button>}
          showIcon
        />
      )}

      <Card className="billing-card" title="Checkout">
        <Steps
          current={checkoutStep}
          items={[
            { title: "Plan" },
            { title: "Payment" },
            { title: "Confirmation" },
          ]}
        />
        {checkoutStep === 0 && (
          <div className="checkout-grid">
            <div className="checkout-main">
              <Card className="plan-card" hoverable>
                <Space direction="vertical">
                  <Title level={4}>{selectedPlan}</Title>
                  <Text type="secondary">${planPrice}/{billingCycle === "monthly" ? "month" : "year"}</Text>
                  <div className="plan-features">
                    {PLAN_FEATURES[selectedPlan].map((feature) => (
                      <Text key={feature}>• {feature}</Text>
                    ))}
                  </div>
                </Space>
              </Card>
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <Text strong>Billing cycle</Text>
                  <Switch
                    checked={billingCycle === "yearly"}
                    onChange={(checked) => setBillingCycle(checked ? "yearly" : "monthly")}
                    checkedChildren="Yearly"
                    unCheckedChildren="Monthly"
                  />
                </div>
                {selectedPlan === "Business" && (
                  <div>
                    <Text strong>Seats</Text>
                    <InputNumber min={3} value={seatCount} onChange={(value) => setSeatCount(value || 3)} />
                    <Text type="secondary">${seatPrice} per seat</Text>
                  </div>
                )}
                <div>
                  <Text strong>Promo code</Text>
                  <Space>
                    <Input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} />
                    <Button onClick={applyPromo}>Apply</Button>
                  </Space>
                  {promoStatus === "valid" && <Text type="success">20% discount applied</Text>}
                  {promoStatus === "invalid" && <Text type="danger">Invalid promo code</Text>}
                </div>
              </Space>
            </div>
            <Card className="order-summary" title="Order summary">
              {orderSummary.map((item) => (
                <div key={item?.label} className="summary-row">
                  <Text>{item?.label}</Text>
                  <Text strong>{item?.value}</Text>
                </div>
              ))}
              <Button type="primary" block onClick={() => setCheckoutStep(1)}>
                Continue to Payment
              </Button>
            </Card>
          </div>
        )}

        {checkoutStep === 1 && (
          <div className="checkout-grid">
            <div className="checkout-main">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card className="stripe-card" title="Payment details">
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Input prefix={<CreditCardOutlined />} placeholder="Card number" />
                    <Space>
                      <Input placeholder="Expiry" />
                      <Input placeholder="CVC" />
                    </Space>
                    <Input placeholder="Cardholder name" />
                    <Select placeholder="Country" options={[{ label: "United States", value: "US" }, { label: "United Kingdom", value: "UK" }]} />
                    <Input placeholder="ZIP / Postal" />
                    <Checkbox checked={savePayment} onChange={(event) => setSavePayment(event.target.checked)}>
                      Save payment method
                    </Checkbox>
                    <Checkbox checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)}>
                      I agree to the terms and conditions
                    </Checkbox>
                  </Space>
                </Card>
                <div className="security-badges">
                  <Tag icon={<LockOutlined />}>SSL Encrypted</Tag>
                  <Tag icon={<SafetyCertificateOutlined />}>PCI Compliant</Tag>
                  <Tag icon={<EuroOutlined />}>Stripe</Tag>
                </div>
              </Space>
            </div>
            <Card className="order-summary" title="Order summary">
              {orderSummary.map((item) => (
                <div key={item?.label} className="summary-row">
                  <Text>{item?.label}</Text>
                  <Text strong>{item?.value}</Text>
                </div>
              ))}
              <Button
                type="primary"
                block
                loading={!termsAccepted}
                disabled={!termsAccepted}
                onClick={() => setCheckoutStep(2)}
              >
                Subscribe Now
              </Button>
            </Card>
          </div>
        )}

        {checkoutStep === 2 && (
          <div className="checkout-confirm">
            <CheckCircleOutlined className="success-icon" />
            <Title level={3}>Welcome to {selectedPlan}!</Title>
            <Space direction="vertical">
              <Text>✓ Your account is now upgraded</Text>
              <Text>✓ Confirmation email sent</Text>
              <Text>✓ Invoice available in billing section</Text>
            </Space>
            <Space>
              <Button type="primary">Go to Dashboard</Button>
              <Button>View Invoice</Button>
            </Space>
          </div>
        )}
      </Card>

      <Card className="billing-card" title="Billing dashboard">
        <Tabs
          items={[
            {
              key: "subscription",
              label: "Subscription",
              children: (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Card className="plan-card">
                    <Space direction="vertical">
                      <Title level={4}>{selectedPlan} Plan</Title>
                      <Badge status="success" text="Active" />
                      <Text>${planPrice}/month</Text>
                      <Text type="secondary">Next billing date: Feb 15, 2026</Text>
                      <Space>
                        <Button onClick={() => setCancelOpen(true)}>Cancel Subscription</Button>
                        <Button type="primary" onClick={() => setPlanChangeOpen(true)}>Change Plan</Button>
                      </Space>
                    </Space>
                  </Card>
                  <Card className="usage-card" title="Usage">
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <div>
                        <Text>Datasets</Text>
                        <Progress percent={46} />
                      </div>
                      <div>
                        <Text>AI Messages</Text>
                        <Progress percent={60} />
                      </div>
                      <div>
                        <Text>Storage</Text>
                        <Progress percent={42} />
                      </div>
                      <Button type="link">View detailed usage</Button>
                    </Space>
                  </Card>
                  <Card className="usage-card" title="Renewal settings">
                    <Space direction="vertical">
                      <Space>
                        <Switch defaultChecked />
                        <Text type="secondary">Auto-renew</Text>
                      </Space>
                      <Space>
                        <Switch defaultChecked />
                        <Text type="secondary">Email reminders</Text>
                      </Space>
                    </Space>
                  </Card>
                </Space>
              ),
            },
            {
              key: "invoices",
              label: "Invoices",
              children: (
                <Space direction="vertical" size="small" style={{ width: "100%" }}>
                  <Space>
                    <Input prefix={<SearchOutlined />} placeholder="Search invoices" />
                    <Input placeholder="Date range" />
                  </Space>
                  <Table
                    dataSource={INVOICE_DATA}
                    columns={[
                      { title: "Invoice #", dataIndex: "invoice" },
                      { title: "Date", dataIndex: "date" },
                      { title: "Amount", dataIndex: "amount" },
                      { title: "Status", dataIndex: "status" },
                      { title: "Actions", render: () => <Button size="small">Download PDF</Button> },
                    ]}
                    pagination={{ pageSize: 4 }}
                    size="small"
                  />
                </Space>
              ),
            },
            {
              key: "payment",
              label: "Payment Methods",
              children: (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  {PAYMENT_METHODS.map((card) => (
                    <Card key={card.id} className="payment-card">
                      <Space direction="vertical">
                        <Text strong>{card.brand} •••• {card.last4}</Text>
                        <Text type="secondary">Expires {card.exp}</Text>
                        {card.isDefault && <Tag color="blue">Default</Tag>}
                        <Space>
                          <Button size="small">Make Default</Button>
                          <Button size="small" danger>Remove</Button>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                  <Button type="dashed" onClick={() => setAddPaymentOpen(true)}>
                    + Add Payment Method
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={planChangeOpen}
        title="Change plan"
        onCancel={() => setPlanChangeOpen(false)}
        onOk={() => {
          setPlanChangeOpen(false);
          notify.success("Plan updated");
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text strong>Current plan: {selectedPlan}</Text>
          <Select
            value={selectedPlan}
            onChange={setSelectedPlan}
            options={["Free", "Professional", "Team", "Business", "Enterprise"].map((plan) => ({ label: plan, value: plan }))}
          />
          <Divider />
          <Text type="secondary">Prorated cost calculation</Text>
          <Text>Current plan credit: -$32.67</Text>
          <Text>New plan cost: $249.00</Text>
          <Text strong>You pay today: $216.33</Text>
          <Button type="link" icon={<SwapOutlined />} onClick={() => setDowngradeOpen(true)}>
            View downgrade warnings
          </Button>
        </Space>
      </Modal>

      <Modal
        open={downgradeOpen}
        title="Downgrade warning"
        onCancel={() => setDowngradeOpen(false)}
        onOk={() => {
          setDowngradeOpen(false);
          notify.info("Downgrade scheduled");
        }}
      >
        <Space direction="vertical">
          <Text strong>You’ll lose access to:</Text>
          <ul>
            <li>Advanced governance</li>
            <li>Unlimited datasets</li>
            <li>SSO</li>
          </ul>
          <Text type="secondary">5 datasets will be archived.</Text>
          <Radio.Group defaultValue="next">
            <Radio value="immediate">Immediately</Radio>
            <Radio value="next">Next billing cycle</Radio>
          </Radio.Group>
          <Space>
            <Button>Keep Current Plan</Button>
            <Button type="primary">Proceed with Downgrade</Button>
          </Space>
        </Space>
      </Modal>

      <Modal
        open={cancelOpen}
        title="Cancel subscription"
        onCancel={() => setCancelOpen(false)}
        onOk={() => {
          setCancelOpen(false);
          setRetentionOpen(true);
        }}
      >
        <Space direction="vertical">
          <Text strong>Why are you cancelling?</Text>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value="expensive">Too expensive</Radio>
              <Radio value="missing">Missing features</Radio>
              <Radio value="unused">Not using it enough</Radio>
              <Radio value="switch">Switching to competitor</Radio>
              <Radio value="other">Other</Radio>
            </Space>
          </Radio.Group>
          <Input.TextArea placeholder="Additional feedback" />
        </Space>
      </Modal>

      <Modal
        open={retentionOpen}
        title="Special offer"
        onCancel={() => setRetentionOpen(false)}
        onOk={() => {
          setRetentionOpen(false);
          setConfirmCancelOpen(true);
        }}
      >
        <Space direction="vertical">
          <Text strong>Wait! Here’s a special offer</Text>
          <Text>Get 20% off for 3 months.</Text>
          <Space>
            <Button type="primary">Accept Offer</Button>
            <Button onClick={() => {
              setRetentionOpen(false);
              setConfirmCancelOpen(true);
            }}>No Thanks, Cancel</Button>
          </Space>
        </Space>
      </Modal>

      <Modal
        open={confirmCancelOpen}
        title="Confirm cancellation"
        onCancel={() => setConfirmCancelOpen(false)}
        onOk={() => {
          setConfirmCancelOpen(false);
          notify.info("Subscription cancelled. Active until Feb 15, 2026.");
        }}
      >
        <Space direction="vertical">
          <Text>Your subscription will remain active until Feb 15, 2026.</Text>
          <Text type="secondary">You’ll lose access to premium analytics and 5 datasets will be archived.</Text>
          <Button type="link">Export data</Button>
          <Text type="secondary">Reactivate anytime.</Text>
        </Space>
      </Modal>

      <Modal
        open={addPaymentOpen}
        title="Add payment method"
        onCancel={() => setAddPaymentOpen(false)}
        onOk={() => {
          setAddPaymentOpen(false);
          notify.success("Payment method added");
        }}
      >
        <Space direction="vertical">
          <Input prefix={<CreditCardOutlined />} placeholder="Card number" />
          <Space>
            <Input placeholder="Expiry" />
            <Input placeholder="CVC" />
          </Space>
        </Space>
      </Modal>
    </div>
  );
}
