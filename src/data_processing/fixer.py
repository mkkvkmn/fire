import pandas as pd
import logging
import os

from config.settings import SETTINGS
from utils.helpers import has_content, save_on_debug


def apply_fixes(df: pd.DataFrame, df_fixes: pd.DataFrame) -> pd.DataFrame:
    """
    applies fixes to the dataframe based on the fixes configuration file.

    :param df: dataframe to apply fixes to.
    :param fix_file_path: path to the csv file containing the fixes configuration.
    :return: dataframe with the fixes applied.
    """
    try:
        # apply fixes using transaction_id - transaction_id does not contain the owner information so it will fix all rows with the same transaction_id
        for index, fix in df_fixes.iterrows():
            try:
                data_index = df[df["transaction_id"] == fix["transaction_id"]].index

                if not data_index.empty:
                    # assume user wants to replace the value using fix only if it's set in fix file, else use original
                    df.at[data_index[0], "rule_id"] = (
                        fix["id"]
                        if has_content(fix["id"])
                        else df.at[data_index[0], "rule_id"]
                    )
                    df.at[data_index[0], "date"] = (
                        fix["date"]
                        if has_content(fix["date"])
                        else df.at[data_index[0], "date"]
                    )
                    df.at[data_index[0], "description"] = (
                        fix["description"]
                        if has_content(fix["description"])
                        else df.at[data_index[0], "description"]
                    )
                    df.at[data_index[0], "info"] = (
                        fix["info"]
                        if has_content(fix["info"])
                        else df.at[data_index[0], "info"]
                    )
                    df.at[data_index[0], "amount"] = (
                        fix["amount"]
                        if has_content(fix["amount"])
                        else df.at[data_index[0], "amount"]
                    )
                    df.at[data_index[0], "class"] = (
                        fix["class"]
                        if has_content(fix["class"])
                        else df.at[data_index[0], "class"]
                    )
                    df.at[data_index[0], "category"] = (
                        fix["category"]
                        if has_content(fix["category"])
                        else df.at[data_index[0], "category"]
                    )
                    df.at[data_index[0], "sub_category"] = (
                        fix["sub_category"]
                        if has_content(fix["sub_category"])
                        else df.at[data_index[0], "sub_category"]
                    )
                    logging.debug("applied fixes using transaction_id")
            except KeyError as e:
                logging.error(f"Fix - KeyError in file {SETTINGS['fixes_file']}: {e}")
                raise

        # fix using transaction_row_id - transaction_row_id contains the owner information so it will fix only the row with the same transaction_row_id
        for index, fix in df_fixes.iterrows():
            try:
                data_index = df[df["transaction_row_id"] == fix["transaction_id"]].index

                if not data_index.empty:
                    # assume user wants to replace the value using fix only if it's set in fix file, else use original
                    df.at[data_index[0], "rule_id"] = (
                        fix["id"]
                        if has_content(fix["id"])
                        else df.at[data_index[0], "rule_id"]
                    )
                    df.at[data_index[0], "date"] = (
                        fix["date"]
                        if has_content(fix["date"])
                        else df.at[data_index[0], "date"]
                    )
                    df.at[data_index[0], "description"] = (
                        fix["description"]
                        if has_content(fix["description"])
                        else df.at[data_index[0], "description"]
                    )
                    df.at[data_index[0], "info"] = (
                        fix["info"]
                        if has_content(fix["info"])
                        else df.at[data_index[0], "info"]
                    )
                    df.at[data_index[0], "amount"] = (
                        fix["amount"]
                        if has_content(fix["amount"])
                        else df.at[data_index[0], "amount"]
                    )
                    df.at[data_index[0], "class"] = (
                        fix["class"]
                        if has_content(fix["class"])
                        else df.at[data_index[0], "class"]
                    )
                    df.at[data_index[0], "category"] = (
                        fix["category"]
                        if has_content(fix["category"])
                        else df.at[data_index[0], "category"]
                    )
                    df.at[data_index[0], "sub_category"] = (
                        fix["sub_category"]
                        if has_content(fix["sub_category"])
                        else df.at[data_index[0], "sub_category"]
                    )
                    logging.debug("applied fixes using transaction_row_id")
            except KeyError as e:
                logging.error(f"Fix - KeyError in file {SETTINGS['fixes_file']}: {e}")
                raise

        logging.info("fixes ok")
        save_on_debug(
            df,
            os.path.join(SETTINGS["intermediate_folder"], "4_fixed.csv"),
        )
        return df
    except Exception as e:
        logging.error(f"error - apply_fixes: {e}")
        raise
