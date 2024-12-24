import pandas as pd


def filter_data_by_date(df, start_date, end_date):
    """
    filters the data by the given date range.
    """
    # convert to datetime
    start_date = pd.to_datetime(start_date, errors="coerce")
    end_date = pd.to_datetime(end_date, errors="coerce")

    if start_date is None or end_date is None:
        return pd.DataFrame()

    # filter data
    date_filtered = df.copy()
    date_filtered["date"] = pd.to_datetime(date_filtered["date"], errors="coerce")
    date_filtered = date_filtered.dropna(subset=["date"])
    date_filtered = date_filtered[
        (date_filtered["date"] >= start_date) & (date_filtered["date"] <= end_date)
    ]

    return date_filtered


def pre_aggregate_data(df):
    """
    pre-aggregates the data by different granularities.
    """
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])

    aggregations = {}
    granularities = ["M", "Q", "Y"]

    for granularity in granularities:
        temp_df = df.copy()
        temp_df["period"] = temp_df["date"].dt.to_period(granularity)
        grouped = temp_df.groupby(["period", "class"])["amount"].sum().reset_index()
        grouped["period"] = grouped["period"].astype(str)
        aggregations[granularity] = grouped

    return aggregations
