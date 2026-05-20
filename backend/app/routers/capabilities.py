"""GET /capabilities — structured discovery of what the AI agent can do.

Returns a static JSON document describing supported intents, operations,
cookbook sections, and connectors. No auth required (public docs endpoint).
"""

from fastapi import APIRouter

router = APIRouter(tags=["capabilities"])

_CAPABILITIES: dict = {
    "version": "1.0",
    "agent": {
        "modes": ["manual", "auto"],
        "intents": [
            {
                "name": "clean",
                "description": "Remove duplicates, fix formats, fill missing values, standardize strings.",
                "example_phrases": ["remove duplicates", "fix email format", "fill missing country"],
            },
            {
                "name": "transform",
                "description": "Reshape, pivot, melt, add/rename/cast columns, bin, sort.",
                "example_phrases": ["pivot by month", "add age band column", "bin revenue into quartiles"],
            },
            {
                "name": "sql_query",
                "description": "Arbitrary SQL analytics, statistical tests, geospatial queries.",
                "example_phrases": [
                    "t-test between groups",
                    "haversine distance",
                    "chi-square test",
                    "ANOVA",
                    "top N per category",
                ],
            },
            {
                "name": "summarise",
                "description": "Aggregations, cohort analysis, RFM, funnels, MoM/YoY deltas.",
                "example_phrases": [
                    "cohort retention",
                    "RFM segmentation",
                    "funnel conversion",
                    "month-over-month revenue",
                    "year-over-year delta",
                ],
            },
            {
                "name": "visualise",
                "description": "Create charts using the cookbook chart-type selector.",
                "example_phrases": [
                    "plot revenue over time",
                    "histogram of age",
                    "scatter by region",
                    "funnel chart",
                ],
            },
            {
                "name": "ml_prep",
                "description": "Feature engineering, train/val/test splits, scaling, encoding, text vectorization.",
                "example_phrases": [
                    "split train test",
                    "scale features",
                    "one-hot encode category",
                    "TF-IDF vectorize text",
                    "feature importance",
                ],
            },
            {
                "name": "goal",
                "description": "Multi-step pipeline from a high-level objective.",
                "example_phrases": [
                    "build a churn prediction dataset",
                    "clean and segment customers",
                    "build a dashboard",
                ],
            },
        ],
    },
    "cookbook_sections": [
        {
            "id": "A",
            "title": "Deduplication",
            "operations": ["exact_dedup", "fuzzy_dedup", "keep_latest"],
        },
        {
            "id": "B",
            "title": "Missing Value Handling",
            "operations": ["fill_missing", "drop_missing", "interpolate"],
        },
        {
            "id": "C",
            "title": "String / Format Standardization",
            "operations": ["trim", "lower", "upper", "regex_replace", "email_normalize", "phone_normalize"],
        },
        {
            "id": "D",
            "title": "Date / Type Casting",
            "operations": ["cast_date", "cast_numeric", "extract_date_parts"],
        },
        {
            "id": "E",
            "title": "Outlier Handling",
            "operations": ["iqr_clip", "zscore_filter", "cap_outliers"],
        },
        {
            "id": "F",
            "title": "Reshaping",
            "operations": ["pivot", "unpivot", "merge_datasets", "union"],
        },
        {
            "id": "G",
            "title": "Multi-rule Pipelines",
            "operations": ["chained_steps"],
        },
        {
            "id": "H",
            "title": "ML Prep",
            "operations": [
                "train_test_split",
                "scale_features",
                "encode_categorical",
                "bin_column",
                "add_interaction_features",
                "dimensionality_reduction",
                "variance_threshold",
                "correlation_filter",
                "smote_oversample",
            ],
        },
        {
            "id": "I",
            "title": "Advanced Analytics",
            "operations": [
                "t_test",
                "chi_square",
                "anova",
                "cohort_retention",
                "funnel",
                "rfm_segmentation",
                "qualify_top_n",
                "percent_of_total",
                "running_cumulative",
                "mom_yoy_delta",
                "trend_moving_avg",
                "seasonality_dow",
                "anomaly_residuals",
                "naive_forecast",
                "exponential_smoothing",
                "haversine",
                "bounding_box_filter",
                "sessionization",
            ],
        },
        {
            "id": "J",
            "title": "Visualization",
            "chart_types": [
                "histogram",
                "box",
                "violin",
                "bar",
                "scatter",
                "scatter_matrix",
                "heatmap",
                "treemap",
                "funnel",
                "sankey",
                "line",
                "multi_line",
                "map",
                "donut",
                "kpi_sparkline",
            ],
            "features": [
                "auto_binning_sturges",
                "faceting",
                "trend_line",
                "reference_lines",
                "confidence_bands",
                "palette_guidance",
                "dashboard_composition",
            ],
        },
        {
            "id": "K",
            "title": "Advanced ML Prep",
            "operations": [
                "text_bow_vectorize",
                "ngrams",
                "feature_importance_chi_square",
                "feature_importance_point_biserial",
                "reproducibility_metadata",
                "fit_transform_separation",
                "sklearn_pipeline_export",
            ],
        },
    ],
    "plan_linter": {
        "enabled": True,
        "checks": [
            "dag_sanity",
            "backtick_identifiers",
            "chart_missing_sql",
            "ml_fit_before_split",
            "target_leakage",
            "time_series_split_method",
            "unknown_columns",
            "literal_from_dataset",
        ],
    },
    "model_routing": {
        "tiers": [
            {
                "tier": "fast",
                "used_for": ["classify", "converse", "simple_plan"],
            },
            {
                "tier": "versatile",
                "used_for": ["plan", "reflect", "transform", "complex_plan"],
            },
        ],
    },
}


@router.get("/capabilities")
def get_capabilities() -> dict:
    """Return the structured capability manifest for this DataHub AI agent."""
    return _CAPABILITIES
