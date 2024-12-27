from dash.dependencies import Input, Output
import pandas as pd
from config.settings import SETTINGS


def register_overview_kpi_callbacks(app):
    def update_kpi(data, category):
        """
        computes the total for the specified category from the filtered data.
        """
        if not data:
            return 0

        # convert data to dataframe
        date_filtered = pd.DataFrame(data)

        # compute total for the specified category
        total = date_filtered[date_filtered["class"] == category]["amount"].sum()

        return total

    @app.callback(
        [
            Output("kpi-income", "children"),
            Output("kpi-costs", "children"),
            Output("kpi-savings", "children"),
            Output("kpi-savings-pct", "children"),
        ],
        [
            Input("filtered-data", "data"),
        ],
    )
    def update_kpis(data):
        income_category = SETTINGS["category_mappings"]["income"]
        costs_category = SETTINGS["category_mappings"]["costs"]

        total_income = update_kpi(data, income_category)
        total_costs = update_kpi(data, costs_category) * -1

        # calculate savings and savings percentage
        savings = total_income - total_costs
        savings_pct = (savings / total_income) * 100 if total_income != 0 else 0

        # format for display
        total_income_display = f"{total_income:,.2f}"
        total_costs_display = f"{total_costs:,.2f}"
        total_savings_display = f"{savings:,.2f}"
        total_savings_pct_display = f"{savings_pct:,.2f} %"

        return (
            total_income_display,
            total_costs_display,
            total_savings_display,
            total_savings_pct_display,
        )
