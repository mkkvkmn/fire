from dash.dependencies import Input, Output
import pandas as pd
import logging
from config.settings import SETTINGS
from config.translations import translations
from src.visualization.utils.utils_figs import format_value, create_bar_chart
from src.utils.logger import setup_logging

# setup logging
setup_logging()


def register_overview_chart_callbacks(app):
    @app.callback(
        Output("income-costs-bar-chart", "figure"),
        [Input("filtered-data", "data")],
    )
    def update_overview_income_costs_bar_chart(data):
        """
        updates the income and costs bar chart based on the filtered data.

        parameters:
        - data: json-encoded data from the filtered-data store.

        returns:
        - a plotly figure dictionary for the income and costs bar chart.
        """
        if not data:
            return {}

        try:
            # convert data to dataframe
            date_filtered = pd.DataFrame(data)

            # define the desired classes using category_mappings from settings
            income_class = SETTINGS["category_mappings"]["income"]
            costs_class = SETTINGS["category_mappings"]["costs"]
            desired_classes = [income_class, costs_class]

            # define labels
            language = SETTINGS["language"]
            translation = translations[language]
            income_label = translation["income"]
            and_label = translation["and"]
            costs_label = translation["costs"]
            title = f"{income_label} {and_label} {costs_label}"

            # filter the dataframe to include only the desired classes
            date_filtered = date_filtered[date_filtered["class"].isin(desired_classes)]

            # convert costs to positive values
            date_filtered.loc[date_filtered["class"] == costs_class, "amount"] *= -1

            # create bar chart using the reusable function
            fig = create_bar_chart(
                data=date_filtered,
                x="period",
                y="amount",
                color="class",
                title=title,
                desired_classes=desired_classes,
            )

            return fig.to_dict()
        except Exception as e:
            logging.error(f"error - update_overview_income_costs_bar_chart: {e}")
            return {}

    @app.callback(
        Output("assets-bar-chart", "figure"),
        [Input("filtered-data", "data")],
    )
    def update_overview_assets_bar_chart(data):
        """
        updates the assets and liabilities bar chart based on the filtered data.

        parameters:
        - data: json-encoded data from the filtered-data store.

        returns:
        - a plotly figure dictionary for the assets and liabilities bar chart.
        """
        if not data:
            return {}

        try:
            # convert data to dataframe
            date_filtered = pd.DataFrame(data)

            # define the desired classes using category_mappings from settings
            assets_class = SETTINGS["category_mappings"]["assets"]
            liabilities_class = SETTINGS["category_mappings"]["liabilities"]
            desired_classes = [assets_class, liabilities_class]

            # define labels
            language = SETTINGS["language"]
            translation = translations[language]
            assets_label = translation["assets"]
            and_label = translation["and"]
            liabilities_label = translation["liabilities"]
            title = f"{assets_label} {and_label} {liabilities_label}"

            # filter the dataframe to include only the desired classes
            date_filtered = date_filtered[date_filtered["class"].isin(desired_classes)]

            # convert costs to positive values
            date_filtered.loc[
                date_filtered["class"] == liabilities_class, "amount"
            ] *= -1

            # create bar chart using the reusable function
            fig = create_bar_chart(
                data=date_filtered,
                x="period",
                y="amount",
                color="class",
                title=title,
                desired_classes=desired_classes,
            )

            return fig.to_dict()
        except Exception as e:
            logging.error(f"error - update_overview_assets_bar_chart: {e}")
            return {}
