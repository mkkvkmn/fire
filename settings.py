FILES_FOLDER = "./data/"
# FILES_FOLDER = "../fire_data/"

GLOB = {
    "in_folder": FILES_FOLDER + "input",
    "out_folder": FILES_FOLDER + "output",
    "files_file": FILES_FOLDER + "config/files.csv",
    "categories_file": FILES_FOLDER + "config/categories.csv",
    "fixes_file": FILES_FOLDER + "config/fix.csv",
    "splits_file": FILES_FOLDER + "config/splits.csv",
    "default_owner": "mkk",
    "debug": False,
    "debug_folder": FILES_FOLDER + "output/debug",
    "data_file": FILES_FOLDER + "output/data.csv",
    "ext_nordnet_portfolio": True, #True / False
    "ext_nordnet_portfolio_file": FILES_FOLDER + "extensions/nordnet/salkkuraportti.csv",
    "ext_nordnet_portfolio_filename_done": "nnsr.csv",
}