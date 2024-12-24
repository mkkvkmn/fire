from dash.dependencies import Input, Output
import pandas as pd
import plotly.express as px


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

        # create bar chart
        fig = px.bar(
            date_filtered,
            x="period",
            y="amount",
            color="class",
            barmode="group",
            labels={"period": "Period", "amount": "Amount", "class": "Category"},
            title="Income and Costs",
        )

        return fig.to_dict()
