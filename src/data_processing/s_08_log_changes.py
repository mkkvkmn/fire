import logging
import os
import pandas as pd
from datetime import datetime


def log_categorization_changes(
    df_new: pd.DataFrame, df_current: pd.DataFrame, output_dir: str
):
    """
    compares df_new against final_data.csv and logs changes in "class", "category", and "sub_category" by transaction_row_id.
    saves changes to intermediate/categorization_changes.csv and logs changes to the console.

    :param df_new: the final dataframe from the pipeline.
    :param df_current: path to the final_data.csv file.
    :param output_dir: directory to save the changes.
    """
    try:
        # ensure relevant columns are present in both dataframes
        for col in ["class", "category", "sub_category"]:
            if col not in df_new.columns:
                df_new[col] = "__NA__"
            if col not in df_current.columns:
                df_current[col] = "__NA__"

        # merge df_new with df_current on transaction_row_id
        merged_df = df_current.merge(
            df_new, on="transaction_row_id", suffixes=("_current", "_new"), how="left"
        )

        # fill NaN values with a placeholder to ensure correct comparison
        merged_df = merged_df.fillna("")

        # compare the relevant columns
        changes = merged_df[
            (merged_df["class_current"] != merged_df["class_new"])
            | (merged_df["category_current"] != merged_df["category_new"])
            | (merged_df["sub_category_current"] != merged_df["sub_category_new"])
        ][
            [
                "transaction_row_id",
                "class_current",
                "class_new",
                "category_current",
                "category_new",
                "sub_category_current",
                "sub_category_new",
            ]
        ]

        # save changes with a timestamp
        os.makedirs(output_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        changes_file_path = os.path.join(output_dir, f"log_{timestamp}.csv")

        # save to file and log to console
        if not changes.empty:
            changes.to_csv(changes_file_path, index=False)

            logging.warning(
                f"! categorization changes count: {len(changes)}\n"
                + f"please review: {changes_file_path}"
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
