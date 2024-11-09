import pandas as pd
import logging
import os
import datetime
from tqdm import tqdm

from config.settings import SETTINGS
from utils.helpers import save_on_debug


def load_categorization_rules(file_path: str) -> pd.DataFrame:
    """
    loads categorization rules from a csv file.

    :param file_path: path to the csv file containing categorization rules.
    :return: dataframe containing the categorization rules.
    """
    try:
        rules_df = pd.read_csv(file_path, dtype=str)
        logging.info(f"read categorization: {os.path.basename(file_path)}")
        return rules_df
    except Exception as e:
        logging.error(f"error - load_categorization_rules: {file_path}: {e}")
        raise


def validate_categories(df: pd.DataFrame) -> pd.DataFrame:
    """
    validates the categorization rules dataframe.

    :param df: dataframe containing the categorization rules.
    :return: validated dataframe.
    """
    if df["id"].isnull().any():
        raise ValueError(
            f"Empty 'id' value found. Please add id to each row in {SETTINGS['categories_file']}"
        )

    cols_to_replace = df.columns.difference(["id", "class", "category", "sub_category"])
    # replace empty and * for source cols with .* (.* = regex, match any char)
    df[cols_to_replace] = df[cols_to_replace].applymap(
        lambda x: ".*" if pd.isnull(x) or x in ["", "*"] else x
    )

    return df


def apply_categorization(df: pd.DataFrame, rules_df: pd.DataFrame) -> pd.DataFrame:
    """
    applies categorization rules to the dataframe.

    :param df: dataframe to categorize.
    :param rules_df: dataframe containing the categorization rules.
    :return: categorized dataframe.
    """
    try:
        # add new columns for categorization if they don't exist
        for column in ["rule_id", "class", "category", "sub_category"]:
            if column not in df.columns:
                df[column] = pd.NA

        # apply categorization rules
        current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        message = f"{current_time} - root - INFO - categorize "
        for _, rule in tqdm(
            rules_df.iterrows(),
            total=rules_df.shape[0],
            desc=message,
            bar_format="{l_bar}{bar:10}{r_bar}{bar:-10b}",
        ):
            try:
                # create a mask for the current rule
                account_mask = (
                    df["account"].str.contains(
                        rule["account"], case=False, na=False, regex=True
                    )
                    if rule["account"] != ".*"
                    else True
                )
                description_mask = (
                    df["description"].str.contains(
                        rule["description"], case=False, na=False, regex=True
                    )
                    if rule["description"] != ".*"
                    else True
                )
                info_mask = (
                    df["info"].str.contains(
                        rule["info"], case=False, na=False, regex=True
                    )
                    if rule["info"] != ".*"
                    else True
                )
                amount_mask = (
                    df["amount"].astype(float) > 0
                    if rule["amount"] == "pos"
                    else (
                        df["amount"].astype(float) < 0
                        if rule["amount"] == "neg"
                        else (
                            df["amount"].astype(float) == 0
                            if rule["amount"] == "zero"
                            else True
                        )
                    )
                )
            except TypeError as e:
                logging.error(
                    f"TypeError - apply_categorization {SETTINGS['fixes_file']}: {e}"
                )
                logging.error(
                    f"error - empty cell in {SETTINGS['categories_file']} rule id: {rule['id']}"
                )
                raise

            total_mask = account_mask & description_mask & info_mask & amount_mask

            # categorize
            df.loc[total_mask, "rule_id"] = rule["id"]
            df.loc[total_mask, "class"] = rule["class"]
            df.loc[total_mask, "category"] = rule["category"]
            df.loc[total_mask, "sub_category"] = rule["sub_category"]

        df = df[
            [
                "transaction_id",
                "date",
                "account",
                "description",
                "info",
                "amount",
                "class",
                "category",
                "sub_category",
                "rule_id",
                "source_file",
            ]
        ]

        logging.info("applied categories")
        return df
    except Exception as e:
        logging.error(f"error - apply_categorization: {e}")
        raise


def categorize_data(df: pd.DataFrame, rules_df: pd.DataFrame) -> pd.DataFrame:
    """
    categorizes the data using the categorization rules.

    :param df: dataframe to categorize.
    :param rules_df: dataframe containing the categorization rules.
    :return: categorized dataframe.
    """
    try:
        categorized_df = apply_categorization(df, rules_df)
        return categorized_df
    except Exception as e:
        logging.error(f"error - categorize_data: {e}")
        raise


def categorize_data_loop(df: pd.DataFrame, categories_file: str) -> pd.DataFrame:
    """
    categorizes the data in a loop until all data is categorized.

    :param df: dataframe to categorize.
    :param categories_file: path to the csv file containing the categorization rules.
    :return: categorized dataframe.
    """
    while True:
        categories = load_categorization_rules(categories_file)
        categories_validated = validate_categories(categories)
        df = categorize_data(df, categories_validated).sort_values(by="description")
        uncategorized_df = df[df["rule_id"].isna()]

        if uncategorized_df.empty:
            logging.info("all data categorized ok")
            save_on_debug(
                df,
                os.path.join(SETTINGS["intermediate_folder"], "2_categorized.csv"),
            )
            return df
        else:
            print("\ncategories not found for:")
            print(
                uncategorized_df[["date", "account", "description", "info", "amount"]]
                .head(25)
                .to_string(index=False)
            )
            remaining = uncategorized_df.shape[0]
            input(
                f"\nToDo: {remaining} rows, Update categories.csv and press enter to re-categorize... \n\n"
                + "Press 'ctrl + c' to quit (windows)\n\n"
            )
