from src.visualization.base.date_callback import register_date_callbacks
from src.visualization.overview.overview_kpis_callback import register_kpi_callbacks
from src.visualization.overview.overview_charts_callback import register_chart_callbacks


def register_callbacks(app):
    register_date_callbacks(app)
    register_kpi_callbacks(app)
    register_chart_callbacks(app)
