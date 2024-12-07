# src/visualization/data_loader.py

import pandas as pd
from config.settings import SETTINGS


def load_data():
    """
    loads data from the final_result_file specified in the settings.

    :return: dataframe containing the data.
    """
    df = pd.read_csv(SETTINGS["final_result_file"])
    return df
