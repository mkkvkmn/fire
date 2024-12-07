import sys
import os
import dash

# add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from src.visualization.layout import layout
from src.visualization.callbacks import register_callbacks

# initialize the dash app
app = dash.Dash(__name__)

# set the layout
app.layout = layout

# register callbacks
register_callbacks(app)

# run the app
if __name__ == "__main__":
    app.run_server(debug=True)
