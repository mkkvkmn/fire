import pandas as pd
import logging
import os
import re

from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import save_on_debug, clean_string


def set_targets(df_targets: pd.DataFrame) -> pd.DataFrame:
    """
    splits the monthly target amount into monthly values between start and end date for the last date of each month.

    :param df_targets: dataframe containing the targets data.
    :return: dataframe with monthly target values.
    """
    try:
        target_rows = []

        for _, row in df_targets.iterrows():
            target_name = row["target_name"]
            start_date = pd.to_datetime(row["start"])
            end_date = pd.to_datetime(row["end"])
            monthly_amount = row["monthly_target_amount"]
            owner = row["owner"]
            target_class = row["class"] if pd.notna(row["class"]) else ""
            category = row["category"] if pd.notna(row["category"]) else ""
            sub_category = row["sub_category"] if pd.notna(row["sub_category"]) else ""

            # generate monthly dates between start and end
            monthly_dates = pd.date_range(start=start_date, end=end_date, freq="M")

            for date in monthly_dates:
                id = f"{date.strftime('%Y%m%d')}__target__{target_name}__{monthly_amount}__target__{owner}".lower()

                id = clean_string(id)

                target_rows.append(
                    {
                        "date": date,
                        "account": "Target",
                        "description": target_name,
                        "info": None,
                        "amount_original": monthly_amount,
                        "class": target_class,
                        "category": category,
                        "sub_category": sub_category,
                        "rule_id": target_name,
                        "source_file": "targets.csv",
                        "row_type": "Target",
                        "share": 1,
                        "amount": monthly_amount,
                        "owner": owner,
                        "split": False,
                        "not_unique_id": id,
                    }
                )

        df_monthly_targets = pd.DataFrame(target_rows)
        logging.debug(f"targets ok: {df_monthly_targets.shape[0]} rows")

        save_on_debug(
            df_monthly_targets,
            os.path.join(SETTINGS["intermediate_folder"], "8_targets.csv"),
        )

        return df_monthly_targets
    except Exception as e:
        logging.error(f"error - split_monthly_targets: {e}")
        raise
