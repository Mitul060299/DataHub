import { Button, Card, Input, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { disablePlugin, enablePlugin, listPlugins, loadPlugin } from "../api";
import { notify } from "../utils/notify";

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<Array<{ name: string; kind: string; description: string; enabled: boolean; source?: string | null }>>([]);
  const [module, setModule] = useState("");
  const [className, setClassName] = useState("");
  const [kind, setKind] = useState("connector");

  const refresh = async () => {
    try {
      const data = await listPlugins();
      setPlugins(data.plugins || []);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load plugins.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleLoad = async () => {
    if (!module.trim() || !className.trim()) return;
    try {
      await loadPlugin({ module: module.trim(), class_name: className.trim(), kind });
      notify.success("Plugin loaded");
      setModule("");
      setClassName("");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load plugin.";
      notify.error(detail);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Module (e.g. app.plugins.my_plugin)"
            value={module}
            onChange={(event) => setModule(event.target.value)}
            style={{ minWidth: 240 }}
          />
          <Input
            placeholder="Class name"
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            style={{ minWidth: 120 }}
          />
          <Button type="primary" onClick={handleLoad}>
            Load
          </Button>
          <Button onClick={refresh}>Refresh</Button>
        </Space>
        <List
          dataSource={plugins}
          locale={{ emptyText: "No plugins loaded." }}
          renderItem={(item) => (
            <List.Item
              actions={[
                item.enabled ? (
                  <Button key="disable" danger onClick={async () => {
                    await disablePlugin(item.name);
                    notify.success("Disabled");
                    refresh();
                  }}>Disable</Button>
                ) : (
                  <Button key="enable" onClick={async () => {
                    await enablePlugin(item.name);
                    notify.success("Enabled");
                    refresh();
                  }}>Enable</Button>
                )
              ]}
            >
              <Space direction="vertical">
                <Typography.Text strong>{item.name}</Typography.Text>
                <Typography.Text type="secondary">{item.kind} · {item.description || "-"}</Typography.Text>
                <Typography.Text type="secondary">{item.enabled ? "Enabled" : "Disabled"}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
