import { AppstoreOutlined, DatabaseOutlined, HomeOutlined, ShoppingOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const MAIN_TABS = new Set(["home", "workspaces", "marketplace", "settings"]);

const resolveTab = (search: string) => {
  const tab = new URLSearchParams(search).get("tab");
  return tab && MAIN_TABS.has(tab) ? tab : "home";
};

export function TopRibbon() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname.startsWith("/app") ? resolveTab(location.search) : "";

  const handleNav = (tab: string) => {
    if (tab === "workspaces" && !session) {
      navigate("/login?from=workspaces");
      return;
    }
    const nextTab = MAIN_TABS.has(tab) ? tab : "home";
    navigate(`/app?tab=${encodeURIComponent(nextTab)}`);
  };

  return (
    <div className="ai-topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <DatabaseOutlined className="brand-icon" />
          <span>DataHub</span>
        </div>
        <nav className="topbar-nav">
          <Button
            type="text"
            icon={<HomeOutlined />}
            className={`topbar-item ${activeTab === "home" ? "active" : ""}`}
            onClick={() => handleNav("home")}
          >
            Home
          </Button>
          <Button
            type="text"
            icon={<AppstoreOutlined />}
            className={`topbar-item ${activeTab === "workspaces" ? "active" : ""}`}
            onClick={() => handleNav("workspaces")}
          >
            Workspaces
          </Button>
          <Button
            type="text"
            icon={<ShoppingOutlined />}
            className={`topbar-item ${activeTab === "marketplace" ? "active" : ""}`}
            onClick={() => handleNav("marketplace")}
          >
            Marketplace
          </Button>
        </nav>
      </div>
    </div>
  );
}
