import pandas as pd
import logging
import ast
import os

from pprint import pformat

from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import save_on_debug, create_id, parse_date


def append_dataframes(dataframes: dict) -> pd.DataFrame:
    """
    appends multiple dataframes into a single dataframe.

    :param dataframes: dictionary containing dataframes and their properties.
    :return: the combined dataframe.
    """
    df_list = []

    for file_path, data in dataframes.items():
        try:

            df = data["dataframe"]
            props = data["props"]
            column_mapping = props["columns"]

            # reverse so that key is old col and value is new col
            reverse_column_mapping = {v: k for k, v in column_mapping.items()}

            # rename columns
            df.rename(columns=reverse_column_mapping, inplace=True)

            # log column mappings
            logging.debug(f"{os.path.basename(file_path)} column mapping:")
            for old_col, new_col in column_mapping.items():
                logging.debug(f"{old_col} -> {new_col}")

            # add columns if not present
            if "account" not in df.columns:
                df["account"] = props["account"]
            if "record_type" not in df.columns:
                df["record_type"] = "Actual"

            # check if required columns are present
            required_columns = [
                "date",
                "account",
                "description",
                "info",
                "amount",
                "record_type",
            ]
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise KeyError(f"missing required columns: {missing_columns}")

            # select columns
            df = df.loc[
                :,
                required_columns,
            ]

            # add source file and transaction id information to data
            df.loc[:, "source_file"] = props["file_name"]
            df.loc[:, "transaction_id"] = df.apply(create_id, axis=1)

            save_on_debug(
                df, os.path.join(SETTINGS["debug_folder"], "append_1_before_types.csv")
            )

            # convert types
            df["amount"] = (
                df["amount"]
                .astype(str)
                .str.replace("\xa0", "")
                .str.replace(",", ".")
                .str.replace("−", "-")
                .astype(float)
            )
            df["date"] = df["date"].apply(
                lambda x: parse_date(
                    x, formats=props["date_format"], dayfirst=props["day_first"]
                )
            )
            df["info"] = df["info"].fillna("")

            save_on_debug(
                df, os.path.join(SETTINGS["debug_folder"], "append_2_after_types.csv")
            )

            df_list.append(df)

        except KeyError as e:
            logging.error(
                f"key error in append: {os.path.basename(file_path)}"
                + f"\nproperties:\n{pformat(props)}"
                + f"\nerror: {e}"
            )
            raise
        except Exception as e:
            logging.error(f"error - append_dataframes file {file_path}: {e}")
            raise

    df_all = pd.concat(df_list, ignore_index=True)
    df_all = df_all.dropna(subset=["date", "description"], how="all")

    logging.info(f"appended: {len(df_list)} files")

    save_on_debug(
        df_all,
        os.path.join(SETTINGS["intermediate_folder"], "1_loaded.csv"),
    )

    return df_all
