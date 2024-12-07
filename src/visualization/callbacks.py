from dash.dependencies import Input, Output
import plotly.express as px
import pandas as pd
from src.visualization.data_loader import load_data

# load data
df = load_data()


def register_callbacks(app):
    @app.callback(Output("bar-chart", "figure"), [Input("class-dropdown", "value")])
    def update_bar_chart(selected_class):
        # filter data based on selected class
        filtered_df = df[df["class"] == selected_class].copy()

        # summarize data monthly
        filtered_df["date"] = pd.to_datetime(filtered_df["date"])
        filtered_df["month"] = filtered_df["date"].dt.to_period("M").astype(str)
        summary_df = filtered_df.groupby("month")["amount"].sum().reset_index()

        # create bar chart
        fig = px.bar(
            summary_df,
            x="month",
            y="amount",
            title=f"Monthly Summary of {selected_class.capitalize()}",
        )
        return fig
