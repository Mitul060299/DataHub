import {
  Button,
  Card,
  Dropdown,
  Progress,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  DownOutlined,
  FontSizeOutlined,
  NumberOutlined,
  RedoOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { notify } from "../utils/notify";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";

const { Text } = Typography;

type DataRow = {
  id: number;
  product: string | null;
  category: string;
  order_date: string;
  price: number;
  is_active: boolean;
};

type Issue = {
  severity: "warning" | "error";
  message: string;
  fix: string;
  suggestionId: SuggestionId;
};

type SuggestionId =
  | "missing_product"
  | "date_format"
  | "duplicate_rows"
  | "price_outliers";

type TransformationId = SuggestionId;

type Suggestion = {
  id: SuggestionId;
  title: string;
  description: string;
  fix: string;
  impact: string;
};

const DATA_COLUMNS = [
  { key: "product", label: "Product", type: "text" },
  { key: "category", label: "Category", type: "text" },
  { key: "order_date", label: "Order Date", type: "date" },
  { key: "price", label: "Price", type: "number" },
  { key: "is_active", label: "Active", type: "boolean" },
] as const;

const DATA_TYPE_ICONS: Record<string, ReactNode> = {
  text: <FontSizeOutlined />,
  number: <NumberOutlined />,
  date: <CalendarOutlined />,
  boolean: <CheckCircleOutlined />,
};

const TRANSFORM_LABELS: Record<TransformationId, string> = {
  missing_product: "Fill missing products",
  date_format: "Normalize date formats",
  duplicate_rows: "Remove duplicate rows",
  price_outliers: "Cap price outliers",
};

const generateSampleData = (): DataRow[] => {
  const products = ["Widget", "Gadget", "Bolt", "Sprocket", "Gear"];
  const categories = ["Hardware", "Accessories", "Tools"];
  const rows: DataRow[] = [];

  for (let i = 0; i < 120; i += 1) {
    const product = i % 9 === 0 ? null : products[i % products.length];
    const priceBase = 18 + (i % 12) * 2.5;
    const price = i % 27 === 0 ? 3200 + i * 4 : Number(priceBase.toFixed(2));
    const rawDate = i % 7 === 0
      ? `0${(i % 9) + 1}/${(i % 22) + 1}/2025`
      : i % 11 === 0
      ? `${(i % 22) + 1}-0${(i % 9) + 1}-2025`
      : `2025-0${(i % 9) + 1}-${String((i % 22) + 1).padStart(2, "0")}`;

    rows.push({
      id: i + 1,
      product,
      category: categories[i % categories.length],
      order_date: rawDate,
      price,
      is_active: i % 4 !== 0,
    });
  }

  rows.push({ ...rows[5], id: 121 });
  rows.push({ ...rows[16], id: 122 });
  rows.push({ ...rows[32], id: 123 });

  return rows;
};

const normalizeDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const dashMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return value;
};

const applyTransformations = (
  original: DataRow[],
  transformations: TransformationId[]
): DataRow[] => {
  let rows = [...original];

  transformations.forEach((step) => {
    switch (step) {
      case "missing_product":
        rows = rows.map((row) => ({
          ...row,
          product: row.product?.trim() ? row.product : "Unknown",
        }));
        break;
      case "date_format":
        rows = rows.map((row) => ({
          ...row,
          order_date: normalizeDate(row.order_date),
        }));
        break;
      case "duplicate_rows": {
        const seen = new Set<string>();
        rows = rows.filter((row) => {
          const key = `${row.product}|${row.category}|${row.order_date}|${row.price}|${row.is_active}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
        break;
      }
      case "price_outliers":
        rows = rows.map((row) => ({
          ...row,
          price: row.price > 1000 ? 999 : row.price,
        }));
        break;
      default:
        break;
    }
  });

  return rows;
};

const analyzeData = (rows: DataRow[]) => {
  const issuesByCell: Record<number, Record<string, Issue>> = {};
  const issuesByColumn: Record<string, number> = {};

  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  rows.forEach((row) => {
    const key = `${row.product}|${row.category}|${row.order_date}|${row.price}|${row.is_active}`;
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
    }
    seenKeys.add(key);
  });

  rows.forEach((row, index) => {
    const rowIssues: Record<string, Issue> = {};

    if (!row.product || row.product.trim() === "") {
      rowIssues.product = {
        severity: "error",
        message: "Missing product value",
        fix: "Fill with 'Unknown'",
        suggestionId: "missing_product",
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.order_date)) {
      rowIssues.order_date = {
        severity: "warning",
        message: "Inconsistent date format",
        fix: "Normalize to YYYY-MM-DD",
        suggestionId: "date_format",
      };
    }

    if (row.price > 1000) {
      rowIssues.price = {
        severity: "warning",
        message: "Price outlier detected",
        fix: "Cap to 999",
        suggestionId: "price_outliers",
      };
    }

    const key = `${row.product}|${row.category}|${row.order_date}|${row.price}|${row.is_active}`;
    if (duplicateKeys.has(key)) {
      rowIssues.category = {
        severity: "warning",
        message: "Duplicate row",
        fix: "Remove duplicates",
        suggestionId: "duplicate_rows",
      };
    }

    if (Object.keys(rowIssues).length > 0) {
      issuesByCell[index] = rowIssues;
    }
  });

  Object.values(issuesByCell).forEach((rowIssues) => {
    Object.keys(rowIssues).forEach((columnKey) => {
      issuesByColumn[columnKey] = (issuesByColumn[columnKey] || 0) + 1;
    });
  });

  return { issuesByCell, issuesByColumn };
};

export function DataCleaningPanel() {
  const originalData = useMemo(() => generateSampleData(), []);
  const [transformations, setTransformations] = useState<TransformationId[]>([]);
  const [redoStack, setRedoStack] = useState<TransformationId[]>([]);
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<SuggestionId>>(new Set());

  const dataset: DatasetSummary = {
    id: "sales_2024",
    name: "sales_2024",
    rows: originalData.length,
    columns: DATA_COLUMNS.map((column) => column.label),
  };

  const data = useMemo(
    () => applyTransformations(originalData, transformations),
    [originalData, transformations]
  );

  const { issuesByCell, issuesByColumn } = useMemo(() => analyzeData(data), [data]);

  const suggestionList = useMemo<Suggestion[]>(() => {
    const missingCount = data.filter((row) => !row.product || row.product.trim() === "").length;
    const dateCount = data.filter((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.order_date)).length;
    const outlierCount = data.filter((row) => row.price > 1000).length;

    const seenKeys = new Set<string>();
    const duplicateCount = data.filter((row) => {
      const key = `${row.product}|${row.category}|${row.order_date}|${row.price}|${row.is_active}`;
      if (seenKeys.has(key)) {
        return true;
      }
      seenKeys.add(key);
      return false;
    }).length;

    const suggestions: Suggestion[] = [];
    if (missingCount > 0 && !ignoredSuggestions.has("missing_product")) {
      suggestions.push({
        id: "missing_product",
        title: "Missing values",
        description: `${missingCount} missing values in 'product' column`,
        fix: "Fill with 'Unknown'",
        impact: `Will affect ${missingCount} rows`,
      });
    }
    if (dateCount > 0 && !ignoredSuggestions.has("date_format")) {
      suggestions.push({
        id: "date_format",
        title: "Date format inconsistency",
        description: `${dateCount} rows with inconsistent date formats`,
        fix: "Normalize to YYYY-MM-DD",
        impact: `Will affect ${dateCount} rows`,
      });
    }
    if (duplicateCount > 0 && !ignoredSuggestions.has("duplicate_rows")) {
      suggestions.push({
        id: "duplicate_rows",
        title: "Duplicate rows",
        description: `${duplicateCount} duplicate rows detected`,
        fix: "Remove duplicates",
        impact: `Will remove ${duplicateCount} rows`,
      });
    }
    if (outlierCount > 0 && !ignoredSuggestions.has("price_outliers")) {
      suggestions.push({
        id: "price_outliers",
        title: "Price outliers",
        description: `${outlierCount} outliers in 'price' column`,
        fix: "Cap to 999",
        impact: `Will affect ${outlierCount} rows`,
      });
    }
    return suggestions;
  }, [data, ignoredSuggestions]);

  const applyTransformation = (id: TransformationId) => {
    if (transformations.includes(id)) {
      notify.info("Transformation already applied");
      return;
    }
    setTransformations((prev) => [...prev, id]);
    setRedoStack([]);
    notify.success(`${TRANSFORM_LABELS[id]} applied`);
  };

  const applyAll = () => {
    const pendingIds = suggestionList.map((suggestion) => suggestion.id);
    if (pendingIds.length === 0) {
      notify.info("No suggestions to apply");
      return;
    }
    setTransformations((prev) => {
      const next = [...prev];
      pendingIds.forEach((id) => {
        if (!next.includes(id)) {
          next.push(id);
        }
      });
      return next;
    });
    setRedoStack([]);
    notify.success("All suggestions applied");
  };

  const undoLast = () => {
    setTransformations((prev) => {
      if (prev.length === 0) {
        notify.info("No transformations to undo");
        return prev;
      }
      const next = [...prev];
      const last = next.pop() as TransformationId;
      setRedoStack((redoPrev) => [...redoPrev, last]);
      notify.info(`${TRANSFORM_LABELS[last]} undone`);
      return next;
    });
  };

  const redoLast = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) {
        notify.info("No transformations to redo");
        return prev;
      }
      const nextRedo = [...prev];
      const last = nextRedo.pop() as TransformationId;
      setTransformations((current) => [...current, last]);
      notify.success(`${TRANSFORM_LABELS[last]} redone`);
      return nextRedo;
    });
  };

  const remainingIssues = suggestionList.length;
  const beforeCount = originalData.length;
  const afterCount = data.length;

  const handleAIAction = (action: AIAction) => {
    switch (action.type) {
      case "apply_all":
        applyAll();
        break;
      case "apply_fix":
        if (action.payload?.id && typeof action.payload.id === "string") {
          applyTransformation(action.payload.id as TransformationId);
        }
        break;
      case "undo_last":
        undoLast();
        break;
      case "redo_last":
        redoLast();
        break;
      case "show_examples":
        notify.info("Showing examples in the table preview");
        break;
      default:
        notify.info(`AI action: ${action.type}`);
    }
  };

  return (
    <div className="ai-first-layout">
      <div className="ai-first-main">
        <div className="cleaning-root">
          <div className="cleaning-header">
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                Data Cleaning Workbench
              </Typography.Title>
              <Text type="secondary">
                Before: {beforeCount} rows · After: {afterCount} rows
              </Text>
            </div>
            <Space wrap>
              {transformations.length === 0 ? (
                <Tag color="blue">No transformations applied</Tag>
              ) : (
                transformations.map((step) => (
                  <Tag key={step} color="geekblue">
                    {TRANSFORM_LABELS[step]}
                  </Tag>
                ))
              )}
            </Space>
          </div>

          <div className="cleaning-layout">
            <div className="cleaning-table-card">
              <div className="cleaning-table-meta">
                <Space size="middle">
                  <Tag color="green">Previewing first 100 rows</Tag>
                  <Tag color="purple">Quality checks active</Tag>
                </Space>
                <Text type="secondary">
                  Hover on highlighted cells for issue details and quick fixes.
                </Text>
              </div>

              <div className="cleaning-table-wrapper">
                <table className="cleaning-table">
                  <thead>
                    <tr>
                      {DATA_COLUMNS.map((column) => {
                        const issueCount = issuesByColumn[column.key] || 0;
                        const quality = Math.max(
                          0,
                          Math.round(100 - (issueCount / data.length) * 100)
                        );
                        const qualityColor =
                          quality > 90 ? "green" : quality >= 70 ? "yellow" : "red";

                    return (
                      <th key={column.key}>
                        <div className="column-header">
                          <div className="column-title">
                            <span className="column-icon">{DATA_TYPE_ICONS[column.type]}</span>
                            <span>{column.label}</span>
                          </div>
                          <div className="column-quality">
                            <Progress
                              percent={quality}
                              size="small"
                              showInfo={false}
                              strokeColor={
                                qualityColor === "green"
                                  ? "#22c55e"
                                  : qualityColor === "yellow"
                                  ? "#f59e0b"
                                  : "#ef4444"
                              }
                            />
                            <span className={`quality-label quality-${qualityColor}`}>
                              {quality}%
                            </span>
                          </div>
                          <Dropdown
                            trigger={["click"]}
                            menu={{
                              items: [
                                { key: "trim", label: "Trim whitespace" },
                                { key: "replace", label: "Replace values" },
                                { key: "type", label: "Change data type" },
                              ],
                            }}
                          >
                            <Button size="small" type="text" icon={<DownOutlined />} />
                          </Dropdown>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, rowIndex) => (
                  <tr key={row.id}>
                    {DATA_COLUMNS.map((column) => {
                      const value = row[column.key as keyof DataRow];
                      const issue = issuesByCell[rowIndex]?.[column.key];
                      const cellClass = issue
                        ? issue.severity === "error"
                          ? "cell-issue cell-issue-error"
                          : "cell-issue cell-issue-warning"
                        : "";

                      const cellContent = (
                        <div className={`cell-content ${cellClass}`}>
                          {typeof value === "boolean" ? (value ? "True" : "False") : value ?? "—"}
                        </div>
                      );

                      return (
                        <td key={`${row.id}-${column.key}`}>
                          {issue ? (
                            <Tooltip
                              placement="topLeft"
                              overlayClassName="issue-tooltip"
                              title={
                                <div className="issue-tooltip-content">
                                  <Text strong>{issue.message}</Text>
                                  <Text type="secondary">{issue.fix}</Text>
                                  <Button
                                    size="small"
                                    type="primary"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      applyTransformation(issue.suggestionId);
                                    }}
                                  >
                                    Quick Fix
                                  </Button>
                                </div>
                              }
                            >
                              {cellContent}
                            </Tooltip>
                          ) : (
                            cellContent
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cleaning-sidebar">
          <div className="sidebar-title">
            <ThunderboltOutlined />
            <span>AI Suggested Cleaning Steps</span>
          </div>
          <div className="suggestions-list">
            {suggestionList.length === 0 ? (
              <Card className="suggestion-card">
                <Space direction="vertical">
                  <Text strong>All clear 🎉</Text>
                  <Text type="secondary">No remaining issues detected.</Text>
                </Space>
              </Card>
            ) : (
              suggestionList.map((suggestion) => (
                <Card key={suggestion.id} className="suggestion-card" hoverable>
                  <Space direction="vertical" size="small">
                    <Text strong>{suggestion.description}</Text>
                    <Text type="secondary">Suggested fix: {suggestion.fix}</Text>
                    <Text type="secondary">{suggestion.impact}</Text>
                    <Space>
                      <Button
                        type="primary"
                        size="small"
                        onClick={() => applyTransformation(suggestion.id)}
                      >
                        Apply
                      </Button>
                      <Button
                        size="small"
                        onClick={() => notify.info("Customize flow opened")}
                      >
                        Customize
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          setIgnoredSuggestions((prev) => new Set(prev).add(suggestion.id))
                        }
                      >
                        Ignore
                      </Button>
                    </Space>
                  </Space>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="cleaning-action-bar">
        <Space>
          <Button type="primary" onClick={applyAll}>
            Apply All Suggestions
          </Button>
          <Button icon={<UndoOutlined />} onClick={undoLast}>
            Undo Last
          </Button>
          <Button icon={<RedoOutlined />} onClick={redoLast}>
            Redo
          </Button>
          <Button
            icon={<SaveOutlined />}
            onClick={() => notify.success("Recipe saved")}
          >
            Save Recipe
          </Button>
        </Space>
        <Text type="secondary">Status: {remainingIssues} issues remaining</Text>
      </div>
        </div>
      </div>
      <div className="ai-first-chat">
        <AIChat
          context="clean"
          currentDataset={dataset}
          onAction={handleAIAction}
          suggestions={[
            "Remove all duplicates",
            "Fill missing values",
            "Fix date formats",
            "Remove outliers",
            "Standardize column names",
          ]}
        />
      </div>
    </div>
  );
}
