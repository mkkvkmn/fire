import logging
import os
import pandas as pd
from datetime import datetime

from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import create_id
from data_pipeline.src.utils.helpers import write_to_csv


def log_categorization_changes(
    df_new: pd.DataFrame, df_current: pd.DataFrame, output_dir: str
):
    """
    compares df_new against final_data.csv and logs changes in "class", "category", and "sub_category" by transaction_row_id.
    saves changes to intermediate/df_categorization_changes.csv and logs changes to the console.

    :param df_new: the final dataframe from the pipeline.
    :param df_current: path to the final_data.csv file.
    :param output_dir: directory to save the changes.
    """

    # ensure transaction_row_id exists in df_current (might be missing after migrating v1 to v2)
    if "transaction_row_id" not in df_current.columns:
        # ensure df_current has the necessary columns to create transaction_row_id
        if "transaction_id" in df_current.columns and "owner" in df_current.columns:
            df_current["transaction_row_id"] = df_current.apply(
                lambda row: create_id(
                    pd.Series(
                        {
                            "transaction_id": row["transaction_id"],
                            "owner": row["owner"],
                        }
                    )
                ),
                axis=1,
            )

            logging.info(
                "log_categorization_changes: new unique id created, it's normal only after migration from v1 to v2"
            )
        else:
            raise ValueError(
                "\n log_categorization_changes:"
                "\nmissing 'transaction_row_id' and insufficient columns to create it"
                "\nplease ensure 'transaction_id' and 'owner' are present."
            )

    else:

        try:

            # merge df_new with df_current on transaction_row_id
            merged_df = df_current.merge(
                df_new,
                on="transaction_row_id",
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
                    "transaction_row_id",
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

            # save to file and log to console
            if not df_changes.empty:

                os.makedirs(output_dir, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

                # back up current data
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

                # log categorization changes
                df_categorization_changes = df_changes[
                    df_changes["class_new"] != ""
                ].copy()
                if not df_categorization_changes.empty:
                    categorization_changes_file_path = os.path.join(
                        output_dir, f"changes_{timestamp}.csv"
                    )

                    df_categorization_changes.to_csv(
                        categorization_changes_file_path, index=False
                    )
                    logging.warning(
                        f"! \ncategorization changes found: {len(df_changes)}"
                        + "\nplease review categorization changes from file:"
                        + f"\n{categorization_changes_file_path}"
                    )

                # log id changes
                df_id_changes = df_changes[df_changes["class_new"] == ""].copy()
                if not df_id_changes.empty:
                    id_changes_file_path = os.path.join(
                        output_dir, f"id_changes_{timestamp}.csv"
                    )
                    df_id_changes_columns = [
                        "transaction_row_id",
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

                    df_id_changes = df_id_changes[df_id_changes_columns]

                    df_id_changes["change_description"] = (
                        "This row is created with new id. No comparison can be done."
                    )
                    df_id_changes["change_reason"] = (
                        "This happens when owner or any source data field information changes i.e. amount or description"
                    )

                    df_id_changes.to_csv(id_changes_file_path, index=False)
                    logging.warning(
                        f"! \nid changes found: {len(df_id_changes)}"
                        + "\nthis happens when owner or any source data field information changes i.e. amount or description"
                        + "\nplease review records with id change from file:"
                        + f"\n{id_changes_file_path}"
                    )

                user_input = input("\naccept changes? (y/n): ").strip().lower()

                if user_input == "y":
                    logging.info("changes: accepted")
                    pass
                else:
                    raise ValueError(
                        "changes to data not accepted, interrupting pipeline"
                    )

            else:
                logging.info("changes: none")

        except Exception as e:
            logging.error(f"error - log_categorization_changes: {e}")
            raise


if __name__ == "__main__":
    # example usage
    df_new = pd.read_csv("path/to/df_new.csv")  # replace with actual path to df_new
    df_current = pd.read_csv(
        "path/to/final_data.csv"
    )  # replace with actual path to final_data.csv
    output_dir = "intermediate"
    log_categorization_changes(df_new, df_current, output_dir)
