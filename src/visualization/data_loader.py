import pandas as pd
from config.settings import SETTINGS
from src.visualization.utils import pre_aggregate_data


def load_data():
    """
    loads data from the final_result_file specified in the settings and pre-aggregates it.

    :return: dictionary containing pre-aggregated dataframes.
    """
    df = pd.read_csv(SETTINGS["final_result_file"])

    # pre-aggregate the data
    aggregated_data = pre_aggregate_data(df)

    return aggregated_data
