import os
import logging

from dotenv import load_dotenv

# load environment variables from .env file
load_dotenv()

# project root and file paths
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))

# allow overrides for data and config folders
DATA_FOLDER = os.getenv("DATA_FOLDER", os.path.join(PROJECT_ROOT, "data"))
CONFIG_FOLDER = os.getenv("CONFIG_FOLDER", os.path.join(PROJECT_ROOT, "config"))
PREPROCESSORS_FOLDER = os.path.join(DATA_FOLDER, "source_files/for_preprocessors")
LOG_FILE = os.getenv("LOG_FILE", None)


SETTINGS = {
    # app settings
    "default_owner": "mkk",
    # data
    "source_folder": os.path.join(DATA_FOLDER, "source_files"),
    "intermediate_folder": os.path.join(DATA_FOLDER, "intermediate"),
    "final_result_file": os.path.join(DATA_FOLDER, "final/final_data.csv"),
    # config
    "files_file": os.path.join(CONFIG_FOLDER, "source_file_reader/files.csv"),
    "categories_file": os.path.join(CONFIG_FOLDER, "data_processing/categories.csv"),
    "fixes_file": os.path.join(CONFIG_FOLDER, "data_processing/fixes.csv"),
    "splits_file": os.path.join(CONFIG_FOLDER, "data_processing/splits.csv"),
    "use_targets": True,
    "targets_file": os.path.join(CONFIG_FOLDER, "data_processing/targets.csv"),
    # debug
    "debug_folder": os.path.join(DATA_FOLDER, "intermediate/debug"),
    "debug_mode": False,
    "log_file": LOG_FILE,
    # preprocessors
    "preprocessors_folder": PREPROCESSORS_FOLDER,
    "use_nordnet_portfolio": True,
    "nordnet_portfolio_file": os.path.join(
        PREPROCESSORS_FOLDER, "nordnet/nordnet_salkkuraportti.csv"
    ),
}
