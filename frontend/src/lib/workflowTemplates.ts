import { type PipelineStep } from "../contexts/PipelineContext";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Prompt hints the user should customise (column names, thresholds, etc.) */
  hints: string[];
  steps: Array<Omit<PipelineStep, "id" | "appliedAt">>;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "sales-analysis",
    name: "Sales Analysis",
    description: "Clean, summarise and chart a sales dataset",
    icon: "📈",
    hints: ["Replace 'amount' with your revenue column name", "Replace 'region' with your category column"],
    steps: [
      {
        stepNumber: 1,
        operation: "fill_nulls",
        description: "Fill missing values with 0",
        sql: "SELECT * REPLACE (COALESCE(amount, 0) AS amount) FROM dataset",
      },
      {
        stepNumber: 2,
        operation: "aggregate",
        description: "Summarise total sales by region",
        sql: "SELECT region, SUM(amount) AS total_sales, COUNT(*) AS transactions FROM dataset GROUP BY region ORDER BY total_sales DESC",
      },
      {
        stepNumber: 3,
        operation: "visualise",
        description: "Bar chart: sales by region",
        sql: "SELECT region, SUM(amount) AS total_sales FROM dataset GROUP BY region ORDER BY total_sales DESC",
      },
    ],
  },
  {
    id: "data-quality-audit",
    name: "Data Quality Audit",
    description: "Detect nulls, duplicates and outliers across every column",
    icon: "🔍",
    hints: ["Works on any dataset — no column customisation needed"],
    steps: [
      {
        stepNumber: 1,
        operation: "dedup",
        description: "Remove exact duplicate rows",
        sql: "SELECT DISTINCT * FROM dataset",
      },
      {
        stepNumber: 2,
        operation: "filter",
        description: "Preview rows where key columns are null (edit column names)",
        sql: "SELECT * FROM dataset WHERE amount IS NULL OR id IS NULL",
      },
      {
        stepNumber: 3,
        operation: "summarise",
        description: "Row count after cleaning",
        sql: "SELECT COUNT(*) AS total_rows, COUNT(*) - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM dataset)) AS duplicates_removed FROM dataset",
      },
    ],
  },
  {
    id: "financial-reconciliation",
    name: "Financial Reconciliation",
    description: "Normalise amounts, cast dates and group by accounting period",
    icon: "💰",
    hints: ["Replace 'amount' with your value column", "Replace 'transaction_date' with your date column"],
    steps: [
      {
        stepNumber: 1,
        operation: "cast_types",
        description: "Cast date and amount columns to correct types",
        sql: "SELECT * REPLACE (TRY_CAST(transaction_date AS DATE) AS transaction_date, TRY_CAST(amount AS DOUBLE) AS amount) FROM dataset",
      },
      {
        stepNumber: 2,
        operation: "fill_nulls",
        description: "Default missing amounts to 0",
        sql: "SELECT * REPLACE (COALESCE(amount, 0) AS amount) FROM dataset",
      },
      {
        stepNumber: 3,
        operation: "aggregate",
        description: "Monthly totals",
        sql: "SELECT DATE_TRUNC('month', transaction_date) AS month, SUM(amount) AS net_amount, COUNT(*) AS entries FROM dataset GROUP BY 1 ORDER BY 1",
      },
    ],
  },
  {
    id: "customer-segmentation",
    name: "Customer Segmentation",
    description: "Segment customers by spend tier using quartile bucketing",
    icon: "👥",
    hints: ["Replace 'customer_id' with your ID column", "Replace 'total_spend' with your spend column"],
    steps: [
      {
        stepNumber: 1,
        operation: "fill_nulls",
        description: "Replace missing spend with 0",
        sql: "SELECT * REPLACE (COALESCE(total_spend, 0) AS total_spend) FROM dataset",
      },
      {
        stepNumber: 2,
        operation: "transform",
        description: "Add spend tier (Low / Medium / High / VIP)",
        sql: `WITH quartiles AS (
  SELECT
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_spend) AS q1,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_spend) AS q2,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_spend) AS q3
  FROM dataset
)
SELECT d.*, CASE
  WHEN d.total_spend >= q.q3 THEN 'VIP'
  WHEN d.total_spend >= q.q2 THEN 'High'
  WHEN d.total_spend >= q.q1 THEN 'Medium'
  ELSE 'Low'
END AS spend_tier
FROM dataset d, quartiles q`,
      },
      {
        stepNumber: 3,
        operation: "aggregate",
        description: "Count and average spend per tier",
        sql: "SELECT spend_tier, COUNT(*) AS customers, AVG(total_spend) AS avg_spend FROM dataset GROUP BY spend_tier ORDER BY avg_spend DESC",
      },
    ],
  },
  {
    id: "monthly-reporting",
    name: "Monthly Report",
    description: "Pivot key metrics by month ready for export",
    icon: "📅",
    hints: ["Replace 'event_date' with your date column", "Replace 'value' with your metric column"],
    steps: [
      {
        stepNumber: 1,
        operation: "cast_types",
        description: "Parse date column",
        sql: "SELECT * REPLACE (TRY_CAST(event_date AS DATE) AS event_date) FROM dataset",
      },
      {
        stepNumber: 2,
        operation: "aggregate",
        description: "Monthly totals and row counts",
        sql: "SELECT DATE_TRUNC('month', event_date) AS month, SUM(value) AS total, COUNT(*) AS records FROM dataset GROUP BY 1 ORDER BY 1",
      },
      {
        stepNumber: 3,
        operation: "visualise",
        description: "Line chart: monthly trend",
        sql: "SELECT DATE_TRUNC('month', event_date) AS month, SUM(value) AS total FROM dataset GROUP BY 1 ORDER BY 1",
      },
    ],
  },
];
