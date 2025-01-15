import pandas as pd
import logging
import os

from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import has_content, save_on_debug


def apply_fixes(df: pd.DataFrame, df_fixes: pd.DataFrame) -> pd.DataFrame:
    """
    applies fixes to the dataframe based on the fixes configuration file.

    :param df: dataframe to apply fixes to.
    :param fix_file_path: path to the csv file containing the fixes configuration.
    :return: dataframe with the fixes applied.
    """
    failed_fixes = []

    try:
        # apply fixes using transaction_id
        for index, fix in df_fixes.iterrows():
            try:
                data_index = df[
                    df["not_unique_id"].str.startswith(fix["transaction_id"])
                ].index

                logging.debug(f"applying fix {fix['id']} to: {fix['transaction_id']}")

                if not data_index.empty:
                    logging.debug(
                        f"found: {df.at[data_index[0], 'not_unique_id']} from data"
                    )
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
                else:
                    failed_fixes.append(fix["transaction_id"])
            except KeyError as e:
                logging.error(f"fix - KeyError in file {SETTINGS['fixes_file']}: {e}")
                raise

        if failed_fixes:
            logging.error("!\n\nthese fixes failed:\n" + "\n".join(failed_fixes) + "\n")
            raise ValueError(
                f"{len(failed_fixes)} fixes failed, correct or delete them and try again"
            )

        logging.info("fixes ok")
        save_on_debug(
            df,
            os.path.join(SETTINGS["intermediate_folder"], "7_fixed.csv"),
        )
        return df
    except Exception as e:
        logging.error(f"error - apply_fixes: {e}")
        raise
