import logging
import argparse
import sys
import os
import pandas as pd
import time

# add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../")))

from config.settings import SETTINGS
from utils.logger import setup_logging
from data_processing.preprocessors.nordnet_portfolio import process_portfolio
from source_file_reader.reader import collect_files, read_collected_files
from data_processing.loader import append_dataframes
from data_processing.categorizer import categorize_data_loop
from data_processing.splitter import split_data, create_splits_df
from data_processing.fixer import apply_fixes, create_fixes_df
from utils.helpers import write_to_csv, clean_folder


def main(debug):
    start_time = time.time()

    setup_logging(debug=debug)
    SETTINGS["debug_mode"] = debug
    debug_msg = " (in debug mode)" if debug else ""

    logging.info("fire burning" + debug_msg)

    try:
        clean_folder(SETTINGS["intermediate_folder"])

        # process nordnet portfolio if enabled
        if SETTINGS["nordnet_portfolio"]:
            process_portfolio()

        # collect files
        file_info = collect_files(SETTINGS["source_folder"], SETTINGS["files_file"])

        # read files
        dataframes = read_collected_files(file_info)

        # append dataframes
        df_appended = append_dataframes(dataframes)

        # categorize data
        df_categorized = categorize_data_loop(df_appended, SETTINGS["categories_file"])

        # split data
        df_splits = create_splits_df(SETTINGS["splits_file"])
        df_splitted = split_data(df_categorized, df_splits)

        # apply fixes
        df_fixes = create_fixes_df(SETTINGS["fixes_file"])
        df_fixed = apply_fixes(df_splitted, df_fixes)

        # save final data with fixes
        final_result_file = SETTINGS["final_result_file"]
        write_to_csv(df_fixed, final_result_file)

    except Exception as e:
        logging.error(f"error - main: {e}")
        logging.info("application finished with errors - fix the errors and try again")
        return

    elapsed_time = time.time() - start_time
    logging.info(f"fire done in {elapsed_time:.2f} seconds")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="run the fire application")
    parser.add_argument(
        "-d", "--debug", action="store_true", help="run the application in debug mode"
    )
    args = parser.parse_args()

    main(debug=args.debug)
