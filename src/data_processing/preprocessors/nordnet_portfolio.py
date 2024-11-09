import re
import logging
import os
import pandas as pd
import numpy as np
from utils.helpers import save_on_debug, detect_encoding, write_to_csv
from config.settings import SETTINGS


def process_portfolio():
    logging.info("preprocess: Nordnet portfolio")
    file_path = SETTINGS["nordnet_portfolio_file"]

    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(
                f"\nNordnet porfolio not found:\n{file_path}."
                + "\n1. Check that the file exists in:"
                + f"\n{SETTINGS['preprocessors_folder']}/nordnet."
                + "\n2. Ensure the 'nordnet_portfolio_file' is correct in settings.py\n"
            )

        # set file and encoding
        encodingtype = detect_encoding(file_path)

        # define a pattern to match rows with a currency amount
        account_pattern = "aot"
        cash_pattern = "likvidit varat"
        date_pattern = r"(\d{1,2}\.\d{1,2}\.\d{4})"  # dd.mm.yyyy
        currency_pattern = r"^\d+,\d+\s+[A-Z]{3}$"

        # read csv, always single column, used a delimiter that does not match data
        df = pd.read_csv(
            file_path,
            header=None,
            delimiter="|",
            names=["transaction"],
            encoding=encodingtype,
        )
        logging.debug(f"..read: {os.path.basename(file_path)}")

        # identify and label rows in new columns
        # add account and fill
        df["account"] = ""
        df.loc[
            df["transaction"].str.contains(account_pattern, flags=re.IGNORECASE),
            "account",
        ] = "account"
        save_on_debug(
            df, os.path.join(SETTINGS["debug_folder"], "nordnet_1_col_account.csv")
        )

        # add label and set starting points
        df["label"] = ""
        df.loc[
            df["transaction"].str.contains(currency_pattern, flags=re.IGNORECASE),
            "label",
        ] = "price"
        df.loc[
            df["transaction"].str.contains(cash_pattern, flags=re.IGNORECASE), "label"
        ] = "cash"
        save_on_debug(
            df, os.path.join(SETTINGS["debug_folder"], "nordnet_2_col_label.csv")
        )

        # add date and fill
        df["date"] = ""
        df["date"] = df["transaction"].str.extract(date_pattern).ffill()
        save_on_debug(
            df, os.path.join(SETTINGS["debug_folder"], "nordnet_3_col_date.csv")
        )

        # find the positions of the "price" and "cash" labels
        account_label_locations = df.index[df["account"] == "account"]
        price_label_locations = df.index[df["label"] == "price"]
        cash_label_locations = df.index[df["label"] == "cash"]

        # use account positions to assign the new labels to the corresponding rows
        for idx in account_label_locations:
            df.at[idx + 1, "account"] = df.at[idx + 1, "transaction"]
            df.at[idx, "account"] = ""

        # use price positions to assign the new labels to the corresponding rows
        for idx in price_label_locations:
            df.at[idx - 1, "label"] = "stock"
            df.at[idx + 1, "label"] = "purchase_price"
            df.at[idx + 2, "label"] = "qty"
            df.at[idx + 3, "label"] = "market_value"
            df.at[idx + 4, "label"] = "change"
            df.at[idx + 5, "label"] = "share"

        # use cash positions to assign the new labels to the corresponding rows
        for idx in cash_label_locations:
            df.at[idx + 1, "label"] = "market_value"
            df.at[idx + 2, "label"] = "share"
            df.at[idx, "label"] = "stock"

        # fill accounts
        df["account"].replace("", np.nan, inplace=True)
        df["account"] = df["account"].ffill()

        save_on_debug(
            df, os.path.join(SETTINGS["debug_folder"], "nordnet_4_labels_filled.csv")
        )
        logging.debug("..labels: ok")

        # add stock column
        df["stock"] = pd.Series(
            np.where(df["label"] == "stock", df["transaction"], None)
        ).ffill()
        save_on_debug(
            df, os.path.join(SETTINGS["debug_folder"], "nordnet_5_col_stock.csv")
        )

        # filter out rows with empty labels
        df = df[df["label"] != ""]

        # filter out stock labels (already a column)
        df = df[df["label"] != "stock"]
        save_on_debug(
            df, os.path.join(SETTINGS["debug_folder"], "nordnet_6_filtered.csv")
        )

        # pivot the data so that labels and index are column headers
        pivoted_df = df.pivot(
            index=["date", "account", "stock"], columns="label", values="transaction"
        ).reset_index()

        # make spaces standard
        pivoted_df["price"] = pivoted_df["price"].apply(
            lambda x: re.sub(r"\s", " ", str(x)) if pd.notnull(x) else x
        )

        # split the "Price" column into "Price" and "Currency" columns
        pivoted_df[["price", "currency"]] = pivoted_df["price"].str.split(
            " ", n=1, expand=True
        )

        logging.debug("Nordnet portfolio process: ok")

        save_portfolio(pivoted_df)

        return pivoted_df
    except Exception as e:
        logging.error(f"error - process Nordnet portfolio: {e}")
        raise


def save_portfolio(df_portfolio):
    try:
        # extract the filename from the full path
        base_filename = os.path.basename(SETTINGS["nordnet_portfolio_file"])
        # modify the filename to include '_preprocessed' before the '.csv' extension
        target_filename = base_filename.replace(".csv", "_preprocessed.csv")
        # construct the full path for the target file
        target_file = os.path.join(SETTINGS["source_folder"], target_filename)
        write_to_csv(df_portfolio, target_file)
        logging.info(f"done: {os.path.basename(target_file)}")
    except Exception as e:
        logging.error(f"error - saving Nordnet portfolio: {e}")
        raise
