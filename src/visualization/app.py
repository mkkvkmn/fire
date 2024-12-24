import sys
import os
import dash
import dash_bootstrap_components as dbc

# add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from src.visualization.layouts.base import get_global_layout
from src.visualization.callbacks.kpi import register_kpi_callbacks
from src.visualization.callbacks.charts import register_chart_callbacks
from src.visualization.callbacks.date import register_date_callbacks
from config.settings import SETTINGS

# initialize the dash app
app = dash.Dash(__name__, external_stylesheets=[dbc.themes.BOOTSTRAP])

# set the layout
app.layout = get_global_layout()

# register callbacks
register_date_callbacks(app)
register_kpi_callbacks(app)
register_chart_callbacks(app)

if __name__ == "__main__":
    app.run_server(debug=True)
