import logging
import os
import pandas as pd
from config.settings import SETTINGS
from data_pipeline.src.utils.helpers import create_id, save_on_debug


def add_not_unique_id(df: pd.DataFrame) -> pd.DataFrame:
    try:
        df["not_unique_id"] = df.apply(
            lambda row: create_id(
                pd.Series(
                    {
                        "date": row["date"],
                        "account": row["account"],
                        "description": row["description"],
                        "info": row["info"],
                        "amount_original": row["amount_original"],
                        "row_type": row["row_type"],
                        "source_file": row["source_file"],
                        "owner": row["owner"],
                    }
                )
            ),
            axis=1,
        )

        logging.info("id ok")
        save_on_debug(
            df,
            os.path.join(SETTINGS["intermediate_folder"], "6_add_id.csv"),
        )

        return df
    except KeyError as e:
        logging.error(f"KeyError in add_not_unique_id: {e}")
        raise
    except Exception as e:
        logging.error(f"error - add_not_unique_id: {e}")
        raise
