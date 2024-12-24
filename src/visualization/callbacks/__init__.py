from .date import register_date_callbacks
from .kpi import register_kpi_callbacks


def register_callbacks(app):
    register_date_callbacks(app)
    register_kpi_callbacks(app)
