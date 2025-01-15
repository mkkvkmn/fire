import os
import sys
import logging
import pandas as pd
from datetime import datetime


def load_accepted_duplicates(accepted_file_path: str) -> pd.DataFrame:
    """
    reads previously accepted duplicates from a csv file
    """
    if os.path.exists(accepted_file_path):
        return pd.read_csv(accepted_file_path, usecols=["not_unique_id"])
    return pd.DataFrame(columns=["not_unique_id"])


def save_accepted_duplicates(df: pd.DataFrame, accepted_file_path: str):
    """
    appends newly accepted duplicates to the master list and saves them
    """
    df.to_csv(accepted_file_path, index=False)


def validate_not_unique_id(df_final: pd.DataFrame, output_dir: str):
    """
    ensures not_unique_id is unique in df_final. if new duplicates are found,
    prompts the user to accept or reject them. already accepted duplicates are read
    from accepted_duplicates.csv and won't be prompted again.
    """
    try:
        # filter out rows with amount == 0
        df_final = df_final[df_final["amount"] != 0]

        # identify duplicates of not_unique_id
        duplicates = df_final[df_final["not_unique_id"].duplicated(keep=False)]

        # if no duplicates, we can skip the rest
        if duplicates.empty:
            logging.info("validate_not_unique_id: no duplicates found")
            return

        # ensure output directory and accepted_duplicates file path
        os.makedirs(output_dir, exist_ok=True)
        accepted_duplicates_file = os.path.join(output_dir, "accepted_duplicates.csv")

        # load previously accepted duplicates
        df_accepted = load_accepted_duplicates(accepted_duplicates_file)

        # filter out duplicates that were already accepted
        new_duplicates = duplicates[
            ~duplicates["not_unique_id"].isin(df_accepted["not_unique_id"])
        ]

        # if no new duplicates, skip prompting
        if new_duplicates.empty:
            logging.info("all duplicates already accepted")
            return

        # save new duplicates to a timestamped file for review
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        duplicates_file_path = os.path.join(output_dir, f"duplicates_{timestamp}.csv")
        new_duplicates.to_csv(duplicates_file_path, index=False)

        logging.warning(
            f"!\n\nnew duplicates found: {len(new_duplicates)}"
            f"\nplease review: \n{duplicates_file_path}\n"
        )

        # prompt user to accept or reject these new duplicates
        user_input = input("\naccept new duplicates? (y/n): \n").strip().lower()
        if user_input == "y":
            logging.info("duplicates: accepted")
            df_new_accepts = new_duplicates[["not_unique_id"]].drop_duplicates()
            df_updated_accepts = pd.concat(
                [df_accepted, df_new_accepts]
            ).drop_duplicates(subset=["not_unique_id"])
            save_accepted_duplicates(df_updated_accepts, accepted_duplicates_file)
        else:
            raise ValueError("duplicates not accepted, interrupting pipeline")

    except Exception as e:
        logging.error(f"error - validate_not_unique_id: {e}")
        raise
