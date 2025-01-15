import logging
import os
import pandas as pd
from datetime import datetime

from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import write_to_csv


from typing import Tuple


def add_dummy_not_unique_id(df: pd.DataFrame) -> Tuple[pd.DataFrame, bool]:
    try:
        is_migration = False
        if "not_unique_id" not in df.columns:
            df["not_unique_id"] = (
                "just a dummy value for migration, will be created for future runs"
            )
            logging.info(
                "log_categorization_changes: new unique id created, it's normal only after migration from v1 to v2"
            )
            # not_unique_id should be missing from df only if it's a V1 df so we can assume it's a migration
            is_migration = True
        return df, is_migration
    except Exception as e:
        logging.error(f"error - add_dummy_not_unique_id: {e}")
        raise


def log_id_changes(
    df_changes: pd.DataFrame, output_dir: str, timestamp: str, is_migration: bool
):
    try:
        df_changes = df_changes[df_changes["class_new"] == ""].copy()
        if not df_changes.empty:
            changes_file_path = os.path.join(output_dir, f"id_changes_{timestamp}.csv")
            df_changes_columns = [
                "not_unique_id",
                "date_current",
                "description_current",
                "info_current",
                "amount_current",
                "rule_id_current",
                "owner_current",
                "class_current",
                "category_current",
                "sub_category_current",
            ]

            df_changes = df_changes[df_changes_columns]

            df_changes["change_description"] = (
                "This row is created with new id. No comparison can be done."
            )
            df_changes["change_reason"] = (
                "This happens when there's a change in: date, account, description, info, amount, row_type, source_file or owner"
            )

            df_changes.to_csv(changes_file_path, index=False)

            if is_migration:
                logging.info(
                    f"\n\nid changes found: {len(df_changes)}"
                    + "\nthis happens after migration from v1 to v2, just accept changes."
                    + "\nchanges are logged to a file, but it's useless to view it:"
                    + f"\n{changes_file_path}\n"
                )
            else:
                logging.warning(
                    f"!\n\nid changes found: {len(df_changes)}"
                    + "\nthis happens when owner or any source data field information changes i.e. amount or description"
                    + "\nplease review records with id change from file:"
                    + f"\n{changes_file_path}\n"
                )
    except Exception as e:
        logging.error(f"error - log_id_changes: {e}")
        raise


def log_category_changes(df_changes: pd.DataFrame, output_dir: str, timestamp: str):
    try:
        df_changes = df_changes[df_changes["class_new"] != ""].copy()
        if not df_changes.empty:
            changes_file_path = os.path.join(
                output_dir, f"category_changes_{timestamp}.csv"
            )

            df_changes.to_csv(changes_file_path, index=False)
            logging.warning(
                f"!\n\ncategory changes found: {len(df_changes)}"
                + "\nplease review records with category changes from file:"
                + f"\n{changes_file_path}\n"
            )
    except Exception as e:
        logging.error(f"error - log_category_changes: {e}")
        raise


def backup_final_data(df_current: pd.DataFrame, output_dir: str):
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(
            SETTINGS["final_result_folder"],
            "backup",
            f"final_data_{timestamp}.csv",
        )

        logging.info(
            "due to categorization changes a backup of the final data is created:"
            + f"\n{backup_file}"
        )

        write_to_csv(
            df_current,
            backup_file,
        )
    except Exception as e:
        logging.error(f"error - backup_final_data: {e}")
        raise


def log_categorization_and_id_changes(
    df_new: pd.DataFrame, df_current: pd.DataFrame, output_dir: str
):
    """
    compares df_new against final_data.csv and logs changes in "class", "category", and "sub_category" by not_unique_id.
    saves changes to intermediate/df_categorization_changes.csv and logs changes to the console.

    :param df_new: the final dataframe from the pipeline.
    :param df_current: path to the final_data.csv file.
    :param output_dir: directory to save the changes.
    """
    try:
        df_current, is_migration = add_dummy_not_unique_id(df_current)

        # merge df_new with df_current on not_unique_id
        merged_df = df_current.merge(
            df_new,
            on="not_unique_id",
            suffixes=("_current", "_new"),
            how="left",
        )

        # fill NaN values with a placeholder to ensure correct comparison
        merged_df = merged_df.fillna("")

        # compare the relevant columns
        df_changes = merged_df[
            (merged_df["class_current"] != merged_df["class_new"])
            | (merged_df["category_current"] != merged_df["category_new"])
            | (merged_df["sub_category_current"] != merged_df["sub_category_new"])
        ][
            [
                "not_unique_id",
                "date_current",
                "description_current",
                "info_current",
                "amount_current",
                "rule_id_current",
                "rule_id_new",
                "owner_current",
                "owner_new",
                "class_current",
                "class_new",
                "category_current",
                "category_new",
                "sub_category_current",
                "sub_category_new",
            ]
        ]

        if not df_changes.empty:
            os.makedirs(output_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            backup_final_data(df_current, output_dir)

            log_category_changes(df_changes, output_dir, timestamp)

            log_id_changes(df_changes, output_dir, timestamp, is_migration)

            user_input = input("\naccept changes? (y/n): \n").strip().lower()

            if user_input == "y":
                logging.info("changes: accepted")
                pass
            else:
                raise ValueError("data changes: not accepted, interrupting pipeline...")

        else:
            logging.info("changes: none")

    except Exception as e:
        logging.error(f"error - log_categorization_and_id_changes: {e}")
        raise


if __name__ == "__main__":
    df_new = pd.read_csv("path/to/df_new.csv")  # Replace with actual path to df_new
    df_current = pd.read_csv(
        "path/to/final_data.csv"
    )  # Replace with actual path to final_data.csv
    output_dir = "intermediate"
    log_categorization_and_id_changes(df_new, df_current, output_dir)
