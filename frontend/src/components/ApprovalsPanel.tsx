import { Button, Card, Input, List, Popconfirm, Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import {
  approveRequest,
  createApprovalRequest,
  listApprovalRequests,
  rejectRequest
} from "../api";
import { ApprovalRequest } from "../types";
import { notify } from "../utils/notify";

export function ApprovalsPanel() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [requester, setRequester] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [summary, setSummary] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterRequester, setFilterRequester] = useState("");
  const [filterResourceType, setFilterResourceType] = useState("");
  const [filterResourceId, setFilterResourceId] = useState("");

  const refresh = async () => {
    try {
      const data = await listApprovalRequests({
        status: filterStatus || undefined,
        requester: filterRequester || undefined,
        resource_type: filterResourceType || undefined,
        resource_id: filterResourceId || undefined,
        limit: 200
      });
      setRequests(data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load approvals.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!requester.trim() || !resourceType.trim() || !resourceId.trim() || !summary.trim()) return;
    try {
      await createApprovalRequest({
        requester: requester.trim(),
        resource_type: resourceType.trim(),
        resource_id: resourceId.trim(),
        summary: summary.trim()
      });
      setRequester("");
      setResourceType("");
      setResourceId("");
      setSummary("");
      await refresh();
      notify.success("Approval request submitted");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to submit approval request.";
      notify.error(detail);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest(requestId);
      await refresh();
      notify.success("Request approved");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to approve request.";
      notify.error(detail);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest(requestId);
      await refresh();
      notify.success("Request rejected");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to reject request.";
      notify.error(detail);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Select
            placeholder="Status"
            allowClear
            value={filterStatus}
            onChange={(value) => setFilterStatus(value)}
            style={{ minWidth: 140 }}
            options={[
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" }
            ]}
          />
          <Input
            placeholder="Filter requester"
            value={filterRequester}
            onChange={(event) => setFilterRequester(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Filter resource type"
            value={filterResourceType}
            onChange={(event) => setFilterResourceType(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Filter resource ID"
            value={filterResourceId}
            onChange={(event) => setFilterResourceId(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Button onClick={refresh}>Apply filters</Button>
          <Button
            onClick={() => {
              setFilterStatus(undefined);
              setFilterRequester("");
              setFilterResourceType("");
              setFilterResourceId("");
            }}
          >
            Clear filters
          </Button>
        </Space>
        <Space wrap>
          <Input
            placeholder="Requester"
            value={requester}
            onChange={(event) => setRequester(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Resource type"
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            style={{ minWidth: 140 }}
          />
          <Input
            placeholder="Resource ID"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            style={{ minWidth: 140 }}
          />
          <Input
            placeholder="Summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button type="primary" onClick={handleCreate}>
            Submit
          </Button>
          <Button onClick={refresh}>Refresh</Button>
        </Space>
        <List
          dataSource={requests}
          locale={{ emptyText: "No approval requests yet." }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="approve"
                  title="Approve request?"
                  onConfirm={() => handleApprove(item.request_id)}
                  okText="Approve"
                  cancelText="Cancel"
                  disabled={item.status !== "pending"}
                >
                  <Button disabled={item.status !== "pending"}>Approve</Button>
                </Popconfirm>,
                <Popconfirm
                  key="reject"
                  title="Reject request?"
                  onConfirm={() => handleReject(item.request_id)}
                  okText="Reject"
                  cancelText="Cancel"
                  disabled={item.status !== "pending"}
                >
                  <Button danger disabled={item.status !== "pending"}>
                    Reject
                  </Button>
                </Popconfirm>
              ]}
            >
              <Space direction="vertical">
                <Typography.Text strong>
                  {item.resource_type} {item.resource_id}
                </Typography.Text>
                <Typography.Text>{item.summary}</Typography.Text>
                <Space>
                  <Typography.Text type="secondary">Requested by {item.requester}</Typography.Text>
                  <Tag>{item.status}</Tag>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
