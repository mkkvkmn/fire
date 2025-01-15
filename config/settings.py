import os
import logging

from dotenv import load_dotenv

# load environment variables from .env file
load_dotenv()

# project root and file paths
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))

# these can be overridden with environment variables (.env file)
DATA_FOLDER = os.getenv("DATA_FOLDER", os.path.join(PROJECT_ROOT, "data"))
CONFIG_FOLDER = os.getenv("CONFIG_FOLDER", os.path.join(PROJECT_ROOT, "config"))
DEFAULT_OWNER = os.getenv("DEFAULT_OWNER", "mkk")
USE_TARGETS = os.getenv("USE_TARGETS", "True").lower() == "true"
USE_NORDNET_PORTFOLIO = os.getenv("USE_NORDNET_PORTFOLIO", "True").lower() == "true"
LOG_FILE = os.getenv("LOG_FILE", None)

# other settings
PREPROCESSORS_FOLDER = os.path.join(DATA_FOLDER, "source_files/for_preprocessors")
SETTINGS = {
    # app settings
    "default_owner": DEFAULT_OWNER,
    # data
    "source_folder": os.path.join(DATA_FOLDER, "source_files"),
    "intermediate_folder": os.path.join(DATA_FOLDER, "intermediate"),
    "data_changes_folder": os.path.join(
        DATA_FOLDER, "intermediate/categorization_changes"
    ),
    "duplicates_folder": os.path.join(DATA_FOLDER, "intermediate/duplicates"),
    "final_result_folder": os.path.join(DATA_FOLDER, "final"),
    "final_result_file": os.path.join(DATA_FOLDER, "final/final_data.csv"),
    # config
    "files_file_folder": os.path.join(CONFIG_FOLDER, "source_file_reader"),
    "files_file": os.path.join(CONFIG_FOLDER, "source_file_reader/files.csv"),
    "categories_file": os.path.join(CONFIG_FOLDER, "data_processing/categories.csv"),
    "fixes_file": os.path.join(CONFIG_FOLDER, "data_processing/fixes.csv"),
    "splits_file": os.path.join(CONFIG_FOLDER, "data_processing/splits.csv"),
    "use_targets": USE_TARGETS,
    "targets_file": os.path.join(CONFIG_FOLDER, "data_processing/targets.csv"),
    # debug
    "debug_folder": os.path.join(DATA_FOLDER, "intermediate/debug"),
    "debug_mode": False,
    "log_file": LOG_FILE,
    # preprocessors
    "preprocessors_folder": PREPROCESSORS_FOLDER,
    "use_nordnet_portfolio": USE_NORDNET_PORTFOLIO,
    "nordnet_portfolio_file": os.path.join(
        PREPROCESSORS_FOLDER, "nordnet/nordnet_salkkuraportti.csv"
    ),
}
