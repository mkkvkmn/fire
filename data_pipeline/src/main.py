import logging
import argparse
import os
import pandas as pd
import time

from config.settings import SETTINGS
from data_pipeline.src.utils.logger import setup_logging
from data_pipeline.src.utils.helpers import write_to_csv, clean_folder

from data_pipeline.src.source_file_reader.s_01_files_csv_to_yml import (
    csv_to_yml,
    validate_yml_files,
)
from data_pipeline.src.source_file_reader.s_02_reader import (
    collect_files,
    read_collected_files,
    read_csv_file,
)
from data_pipeline.src.data_processing.preprocessors.nordnet_portfolio import (
    process_portfolio,
)
from data_pipeline.src.data_processing.s_03_loader import append_dataframes
from data_pipeline.src.data_processing.s_04_categorizer import categorize_data_loop
from data_pipeline.src.data_processing.s_05_splitter import split_data, create_splits_df
from data_pipeline.src.data_processing.s_06_add_id import add_not_unique_id
from data_pipeline.src.data_processing.s_07_fixer import apply_fixes
from data_pipeline.src.data_processing.s_08_target_setter import set_targets
from data_pipeline.src.data_processing.s_09_log_changes import (
    log_categorization_and_id_changes,
)
from data_pipeline.src.data_processing.s_10_validate import validate_not_unique_id


def main(debug):
    start_time = time.time()

    setup_logging(debug=debug)
    SETTINGS["debug_mode"] = debug
    debug_msg = "(in debug mode)" if debug else ""

    logging.info(
        "fire burning..."
        + f"\n\nusing data from: {SETTINGS['data_folder']}"
        + f"\nwith config from: {SETTINGS['config_folder']}"
        + f"\n{debug_msg}\n"
    )

    try:
        clean_folder(SETTINGS["intermediate_folder"])

        # convert files.csv to yml
        if os.path.exists(SETTINGS["files_file"]):
            df_files_settings = read_csv_file(SETTINGS["files_file"])
            csv_to_yml(df_files_settings, SETTINGS["files_file_folder"])

        # validate yml files
        validate_yml_files(SETTINGS["files_file_folder"])

        # process nordnet portfolio if enabled
        if SETTINGS.get("use_nordnet_portfolio", False):
            process_portfolio()

        # collect files
        file_info = collect_files(
            SETTINGS["source_folder"], SETTINGS["files_file_folder"]
        )

        # read files
        dataframes = read_collected_files(file_info)

        # append dataframes
        df_appended = append_dataframes(dataframes)

        # categorize data
        df_categorized = categorize_data_loop(df_appended, SETTINGS["categories_file"])

        # split data
        df_splits = create_splits_df(SETTINGS["splits_file"])
        df_splitted = split_data(df_categorized, df_splits)

        # add id
        df_with_id = add_not_unique_id(df_splitted)

        # apply fixes
        df_fixes = read_csv_file(SETTINGS["fixes_file"])
        df_fixed = apply_fixes(df_with_id, df_fixes)

        # set targets if enabled
        if SETTINGS.get("use_targets", False):
            logging.info("use targets: enabled")

            try:
                df_targets = read_csv_file(SETTINGS["targets_file"])
            except FileNotFoundError:
                df_targets = None
                logging.warning(
                    f"targets not found in {SETTINGS['targets_file']}, skipping..."
                )

            if df_targets is not None:
                df_targets_monthly = set_targets(df_targets)
                # append targets to actuals
                df_final = pd.concat([df_fixed, df_targets_monthly], ignore_index=True)
            else:
                df_final = df_fixed
        else:
            logging.info("use targets: disabled")
            df_final = df_fixed

        # log data changes
        df_current = read_csv_file(SETTINGS["final_result_file"])
        log_categorization_and_id_changes(
            df_final, df_current, SETTINGS["data_changes_folder"]
        )

        # validation
        validate_not_unique_id(df_final, SETTINGS["duplicates_folder"])

        # save final data with fixes
        write_to_csv(df_final, SETTINGS["final_result_file"])
        logging.info("great success!")

    except Exception as e:
        logging.error(f"error - main: {e}")
        logging.info("application finished with errors - fix the errors and try again")
        return

    elapsed_time = time.time() - start_time
    logging.info(f"done in {elapsed_time:.2f}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="run the fire application")
    parser.add_argument(
        "-d", "--debug", action="store_true", help="run the application in debug mode"
    )
    args = parser.parse_args()

    main(debug=args.debug)
