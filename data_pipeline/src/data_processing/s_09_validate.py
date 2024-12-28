import logging
import os
import pandas as pd
from datetime import datetime


def validate_unique_id(df_final: pd.DataFrame, output_dir: str):
    """
    validates the final data to ensure that transaction_row_id is unique.
    informs the user of any duplicates and writes a log file to intermediate/duplicates.

    :param df_final: the final dataframe from the pipeline.
    :param output_dir: directory to save the duplicates log file.
    """
    try:
        # check for duplicate transaction_row_id
        duplicates = df_final[df_final["transaction_row_id"].duplicated(keep=False)]

        if not duplicates.empty:
            # save duplicates with a timestamp
            os.makedirs(output_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            duplicates_file_path = os.path.join(
                output_dir, f"duplicates_{timestamp}.csv"
            )
            duplicates.to_csv(duplicates_file_path, index=False)

            logging.warning(
                f"duplicate transaction_row_ids found: {len(duplicates)}\n"
                + f"please review: {duplicates_file_path}"
            )
        else:
            logging.info("validate unique id ok")

    except Exception as e:
        logging.error(f"error - validate_unique_id: {e}")
        raise


if __name__ == "__main__":
    # example usage
    df_final = pd.read_csv(
        "path/to/final_data.csv"
    )  # replace with actual path to final_data.csv
    output_dir = "intermediate"
    validate_unique_id(df_final, output_dir)
