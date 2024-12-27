from dash.dependencies import Input, Output
import pandas as pd
import logging
from config.settings import SETTINGS
from src.utils.logger import setup_logging
from src.visualization.utils.utils_figs import format_value

setup_logging()


def register_overview_kpi_callbacks(app):
    def update_kpi(data, category):
        """
        computes the total for the specified category from the filtered data.

        parameters:
        - data: json-encoded data from the filtered-data store.
        - category: the category for which to compute the total.

        returns:
        - the total amount for the specified category.
        """
        if not data:
            return 0

        try:
            # convert data to dataframe
            date_filtered = pd.DataFrame(data)

            # compute total for the specified category
            total = date_filtered[date_filtered["class"] == category]["amount"].sum()

            return total
        except Exception as e:
            logging.error(f"error - update_kpi {category}: {e}")
            return 0

    @app.callback(
        [
            Output("kpi-income", "children"),
            Output("kpi-costs", "children"),
            Output("kpi-savings", "children"),
            Output("kpi-savings-pct", "children"),
        ],
        [Input("filtered-data", "data")],
    )
    def update_kpis(data):
        """
        updates the kpi values based on the filtered data.

        parameters:
        - data: json-encoded data from the filtered-data store.

        returns:
        - a tuple containing formatted strings for income, costs, savings, and savings percentage.
        """
        try:
            income_category = SETTINGS["category_mappings"]["income"]
            costs_category = SETTINGS["category_mappings"]["costs"]

            total_income = update_kpi(data, income_category)
            total_costs = update_kpi(data, costs_category) * -1

            # calculate savings and savings percentage
            savings = total_income - total_costs
            savings_pct = (savings / total_income) * 100 if total_income != 0 else 0

            # format for display
            total_income_display = format_value(total_income)
            total_costs_display = format_value(total_costs)
            total_savings_display = format_value(savings)
            total_savings_pct_display = f"{int(savings_pct)} %"

            return (
                total_income_display,
                total_costs_display,
                total_savings_display,
                total_savings_pct_display,
            )
        except Exception as e:
            logging.error(f"error - update_kpis: {e}")
            return (
                format_value(0),
                format_value(0),
                format_value(0),
                "0 %",
            )
