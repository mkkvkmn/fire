from dash.dependencies import Input, Output
import pandas as pd
from config.settings import SETTINGS
from src.visualization.utils.utils_figs import create_bar_chart


def register_overview_chart_callbacks(app):
    @app.callback(
        Output("income-costs-bar-chart", "figure"),
        [
            Input("filtered-data", "data"),
        ],
    )
    def update_overview_income_costs_bar_chart(data):
        """
        updates the income and costs bar chart based on the filtered data.
        """
        if not data:
            return {}

        # convert data to dataframe
        date_filtered = pd.DataFrame(data)

        # define the desired classes using category_mappings from settings
        income_class = SETTINGS["category_mappings"]["income"]
        costs_class = SETTINGS["category_mappings"]["costs"]
        desired_classes = [income_class, costs_class]

        # create bar chart using the reusable function
        fig = create_bar_chart(
            data=date_filtered,
            x="period",
            y="amount",
            color="class",
            title="income and costs",
            desired_classes=desired_classes,
        )

        return fig.to_dict()
