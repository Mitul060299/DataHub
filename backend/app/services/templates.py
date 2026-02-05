from typing import List
from ..models import DashboardTemplate, DashboardWidget


def list_templates() -> List[DashboardTemplate]:
    return [
        DashboardTemplate(
            template_id="basic-quality",
            name="Data Quality Overview",
            description="Summary stats, missing values, and correlations.",
            widgets=[
                DashboardWidget(
                    widget_id="tmpl-1",
                    title="Numeric Distribution",
                    chart_type="summary",
                    config={"dataset_id": "{dataset_id}", "column": "{column}", "bins": 10, "top_n": 10},
                ),
                DashboardWidget(
                    widget_id="tmpl-2",
                    title="Correlations",
                    chart_type="correlation",
                    config={"dataset_id": "{dataset_id}"},
                ),
            ],
        ),
        DashboardTemplate(
            template_id="quick-preview",
            name="Quick Preview",
            description="Table preview and categorical summary.",
            widgets=[
                DashboardWidget(
                    widget_id="tmpl-3",
                    title="Table Preview",
                    chart_type="table",
                    config={"dataset_id": "{dataset_id}"},
                ),
                DashboardWidget(
                    widget_id="tmpl-4",
                    title="Top Categories",
                    chart_type="summary",
                    config={"dataset_id": "{dataset_id}", "column": "{column}", "bins": 8, "top_n": 8},
                ),
            ],
        ),
    ]
