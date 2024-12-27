from dash.dependencies import Input, Output
import pandas as pd
from dash import no_update
from src.visualization.utils.utils_data import filter_data_by_date, pre_aggregate_data
from src.visualization.data_loader import load_data

aggregated_data = load_data()


def register_date_callbacks(app):
    @app.callback(
        [
            Output("global-date-range", "start_date"),
            Output("global-date-range", "end_date"),
        ],
        Input("global-date-range", "id"),  # dummy input just to set defaults once
    )
    def set_default_date_range(_):
        """
        sets the default date range to 12 months back from the last day
        of the month of the max date in df.
        """
        df = aggregated_data["M"]  # use monthly data to determine default date range
        if df.empty or "period" not in df.columns:
            return no_update, no_update

        # convert period column to period objects
        df["period"] = pd.PeriodIndex(df["period"], freq="M")

        # convert period column to datetime
        df["date"] = df["period"].apply(lambda x: x.start_time)
        valid_df = df.dropna(subset=["date"])

        if valid_df.empty:
            return no_update, no_update

        # get max date, then set to last day of that month
        max_date = valid_df["date"].max()
        last_day_of_month = (max_date.replace(day=1) + pd.offsets.MonthEnd(1)).date()

        # 12 months back = that same day last year + 1 day
        first_day_12_months_back = last_day_of_month.replace(day=1) - pd.DateOffset(
            months=11
        )

        return first_day_12_months_back.strftime(
            "%Y-%m-%d"
        ), last_day_of_month.strftime("%Y-%m-%d")

    @app.callback(
        Output("filtered-data", "data"),
        [
            Input("global-date-range", "start_date"),
            Input("global-date-range", "end_date"),
            Input("date-granularity", "value"),
        ],
    )
    def filter_and_store_data(start_date, end_date, granularity):
        """
        filters the pre-aggregated data by the given date range and stores it in dcc.Store.
        """
        df = aggregated_data[granularity]

        # convert period column to period objects
        df["period"] = pd.PeriodIndex(df["period"], freq=granularity)

        # convert period column to datetime
        df["date"] = df["period"].apply(lambda x: x.start_time)

        date_filtered = df[
            (df["date"] >= pd.to_datetime(start_date))
            & (df["date"] <= pd.to_datetime(end_date))
        ].copy()

        if date_filtered.empty:
            return no_update

        # convert period column to string for JSON serialization
        date_filtered["period"] = date_filtered["period"].astype(str)

        # convert to dictionary for storage
        return date_filtered.to_dict("records")
