from dash.dependencies import Input, Output
import pandas as pd
import plotly.express as px
from config.settings import SETTINGS


def register_chart_callbacks(app):
    @app.callback(
        Output("income-costs-bar-chart", "figure"),
        [
            Input("filtered-data", "data"),
        ],
    )
    def update_bar_chart(data):
        """
        updates the bar chart based on the filtered data.
        """
        if not data:
            return {}

        # convert data to DataFrame
        date_filtered = pd.DataFrame(data)

        # define the desired classes using category_mappings from settings
        income_class = SETTINGS["category_mappings"]["income"]
        costs_class = SETTINGS["category_mappings"]["costs"]
        desired_classes = [income_class, costs_class]

        # filter the DataFrame to include only the desired classes
        date_filtered = date_filtered[date_filtered["class"].isin(desired_classes)]

        # convert costs to positive values
        date_filtered.loc[date_filtered["class"] == costs_class, "amount"] *= -1

        # create bar chart
        fig = px.bar(
            date_filtered,
            x="period",
            y="amount",
            color="class",
            barmode="group",
            labels={"period": "Period", "amount": "Amount", "class": "Category"},
            title="Income and Costs",
            template="plotly_dark",
        )

        # style the start matching KPI's
        fig.update_layout(
            yaxis_tickformat=",.2f",
            xaxis_title="Period",
            yaxis_title="Amount",
            legend_title="Category",
        )

        return fig.to_dict()
