import pandas as pd
import logging
import os

from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import create_id, save_on_debug


def create_splits_df(file_path: str) -> pd.DataFrame:
    """
    creates a splits dataframe from a file path.

    :param file_path: path to the csv file containing the splits configuration.
    :return: dataframe containing the splits configuration.
    """
    splits_df = pd.read_csv(file_path, parse_dates=["start", "end"])
    splits_df = splits_df.dropna(subset=["start"], how="all")  # remove empty rows

    # ensure data types
    splits_df["share"] = pd.to_numeric(splits_df["share"])
    splits_df["start"] = pd.to_datetime(splits_df["start"])
    splits_df["end"] = pd.to_datetime(splits_df["end"])

    return splits_df


def split_data(df: pd.DataFrame, splits_df: pd.DataFrame) -> pd.DataFrame:
    """
    splits the data between owners based on the splits configuration dataframe.

    :param df: dataframe to split.
    :param splits_df: dataframe containing the splits configuration.
    :return: dataframe with the data split between owners.
    """
    try:
        # check for required columns in the input dataframe
        required_columns = ["transaction_id", "date", "account", "amount"]
        for col in required_columns:
            if col not in df.columns:
                raise KeyError(f"split_data - missing column: {col}")

        # convert date column to datetime
        df["date"] = pd.to_datetime(df["date"])

        # add split columns
        df = df.rename(columns={"amount": "amount_orig"})
        df["share"] = 1
        df["amount"] = df["amount_orig"]
        df["owner"] = SETTINGS["default_owner"]
        df["split"] = False
        df["transaction_row_id"] = df["transaction_id"]

        split_dfs = []

        for _, split in splits_df.iterrows():
            # create a mask to filter rows that match the split criteria
            mask = (
                (df["account"] == split["account"])
                & (df["date"] >= split["start"])
                & (df["date"] <= split["end"])
            )

            # create a temporary dataframe with the split data
            temp_df = df[mask].copy()

            try:
                # adjust the amount and add the owner
                temp_df["amount"] = temp_df["amount_orig"] * split["share"]
                temp_df["share"] = split["share"]
                temp_df["owner"] = split["owner"]
                temp_df["transaction_row_id"] = temp_df.apply(
                    lambda row: create_id(
                        pd.Series(
                            {
                                "transaction_id": row["transaction_id"],
                                "owner": split["owner"],
                            }
                        )
                    ),
                    axis=1,
                )
                temp_df["split"] = True  # set the split column to True for split rows
            except TypeError as e:
                logging.error(f"TypeError - split_data: {split}: {e}")
                raise

            split_dfs.append(temp_df)

            # mark the original rows as split to exclude them later
            df.loc[mask, "split"] = True

        # combine the original dataframe with the split dataframes
        original_df = df[~df["split"]]
        result_df = pd.concat([original_df] + split_dfs, ignore_index=True)

        logging.info("splits ok")
        save_on_debug(
            result_df,
            os.path.join(SETTINGS["intermediate_folder"], "3_splitted.csv"),
        )
        return result_df
    except Exception as e:
        logging.error(f"error - split_data: {e}")
        raise
