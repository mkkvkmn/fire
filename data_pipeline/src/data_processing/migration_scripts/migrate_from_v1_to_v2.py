import os
import shutil
import argparse
import logging

logging.basicConfig(
    level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s"
)


def create_directories(new_structure, new_base_dir):
    for new_dir in new_structure.keys():
        new_dir_path = os.path.join(new_base_dir, new_dir)
        os.makedirs(new_dir_path, exist_ok=True)
        logging.debug(f"created directory: {new_dir_path}")


def copy_config_files(old_structure, new_structure, old_base_dir, new_base_dir):
    for old_dir, files in old_structure.items():
        for file in files:
            old_path = os.path.join(old_base_dir, old_dir, file)
            for new_dir, new_files in new_structure.items():
                if file in new_files or (
                    file == "fix.csv" and "fixes.csv" in new_files
                ):
                    new_file = "fixes.csv" if file == "fix.csv" else file
                    new_path = os.path.join(new_base_dir, new_dir, new_file)
                    if os.path.exists(old_path):
                        shutil.copy2(old_path, new_path)
                        logging.debug(f"config: copied {old_path} to {new_path}")
                    else:
                        logging.warning(f"config file not found: {old_path}")


def update_categories_csv(new_base_dir):
    """
    replace 'nnsr' with 'nordnet_salkkuraportti' in categories.csv.
    """
    import os

    categories_csv_path = os.path.join(
        new_base_dir, "config", "data_processing", "categories.csv"
    )

    if os.path.exists(categories_csv_path):
        with open(categories_csv_path, "r") as file:
            content = file.read()

        content = content.replace("nnsr", "nordnet_salkkuraportti")
        content = content.replace(",nn,", ",nordnet_salkkuraportti,")

        with open(categories_csv_path, "w") as file:
            file.write(content)

        print(f"updated {categories_csv_path}")


def copy_salkkuraportti(old_base_dir, new_base_dir):
    old_path = os.path.join(old_base_dir, "extensions", "nordnet", "salkkuraportti.csv")
    new_path = os.path.join(
        new_base_dir,
        "data",
        "source_files",
        "for_preprocessors",
        "nordnet",
        "nordnet_salkkuraportti.csv",
    )
    if os.path.exists(old_path):
        shutil.copy2(old_path, new_path)
        logging.debug(f"copied {old_path} to {new_path}")
    else:
        logging.warning(f"old salkkuraportti file not found: {old_path}")


def copy_input_files(old_base_dir, new_base_dir):
    old_input_dir = os.path.join(old_base_dir, "input")
    new_input_dir = os.path.join(new_base_dir, "data", "source_files")
    if not os.path.exists(old_input_dir):
        logging.warning(f"old input directory not found: {old_input_dir}")
        return
    for file in os.listdir(old_input_dir):
        if file != "nnsr.csv":  # exclude, file is created with preprocessors
            old_path = os.path.join(old_input_dir, file)
            new_path = os.path.join(new_input_dir, file)
            if os.path.exists(old_path):
                shutil.copy2(old_path, new_path)
                logging.debug(f"input copied {old_path} to {new_path}")
            else:
                logging.warning(f"input file not found: {old_path}")


def copy_data_csv(old_base_dir, new_base_dir):
    old_data_path = os.path.join(old_base_dir, "output", "data.csv")
    new_data_path = os.path.join(new_base_dir, "data", "final", "final_data.csv")
    if os.path.exists(old_data_path):
        shutil.copy2(old_data_path, new_data_path)
        logging.debug(f"data copied {old_data_path} to {new_data_path}")
    else:
        logging.warning(f"data file not found: {old_data_path}")


def copy_config_from_repository(repository_config_dir, new_base_dir):
    """
    copies the config files (settings.py, nordnet_salkkuraportti_preprocessed.csv.yml, and __init__.py)
    from the current repository to the new config folder.
    """

    # define source paths in the current repository.
    src_settings = os.path.join(repository_config_dir, "settings.py")
    src_init = os.path.join(repository_config_dir, "__init__.py")
    src_nordnet_salkkuraportti_yml = os.path.join(
        repository_config_dir,
        "source_file_reader",
        "nordnet_salkkuraportti_preprocessed.csv.yml",
    )

    # define destination paths in the new config folder.
    new_config_dir = os.path.join(new_base_dir, "config")
    dst_settings = os.path.join(new_config_dir, "settings.py")
    dst_init = os.path.join(new_config_dir, "__init__.py")
    dst_salkkuraportti_yml = os.path.join(
        new_config_dir,
        "source_file_reader",
        "nordnet_salkkuraportti_preprocessed.csv.yml",
    )

    # create config and source_file_reader dirs if they don't exist.
    os.makedirs(os.path.join(new_config_dir, "source_file_reader"), exist_ok=True)

    # copy settings.py
    if os.path.exists(src_settings):
        shutil.copy2(src_settings, dst_settings)
        logging.debug(f"copied settings.py from {src_settings} to {dst_settings}")
    else:
        logging.warning(f"settings.py not found at {src_settings}")

    # copy __init__.py
    if os.path.exists(src_init):
        shutil.copy2(src_init, dst_init)
        logging.debug(f"copied __init__.py from {src_init} to {dst_init}")
    else:
        logging.warning(f"__init__.py not found at {src_init}")

    # copy nordnet_salkkuraportti_preprocessed.csv.yml
    if os.path.exists(src_nordnet_salkkuraportti_yml):
        shutil.copy2(src_nordnet_salkkuraportti_yml, dst_salkkuraportti_yml)
        logging.debug(
            f"copied nordnet_salkkuraportti_preprocessed.csv.yml from "
            f"{src_nordnet_salkkuraportti_yml} to {dst_salkkuraportti_yml}"
        )
    else:
        logging.warning(
            f"nordnet_salkkuraportti_preprocessed.csv.yml not found at "
            f"{src_nordnet_salkkuraportti_yml}"
        )


def migrate_structure(old_base_dir, new_base_dir):
    # define old and new directory structures
    repository_config_dir = os.path.join("../../../..", "config")
    old_structure = {
        "config": ["categories.csv", "files.csv", "fix.csv", "splits.csv"],
        "extensions/nordnet": ["salkkuraportti.csv"],
        "input": [],  # all files in input folder will be copied, excluding nnsr.csv
        "output": ["data.csv"],
    }

    new_structure = {
        "config/source_file_reader": ["files.csv"],
        "config/data_processing": ["categories.csv", "fixes.csv", "splits.csv"],
        "data/source_files": [],  # all files from input folder copied here, excluding nnsr.csv
        "data/source_files/for_preprocessors/nordnet": ["nordnet_salkkuraportti.csv"],
        "data/final": ["final_data.csv"],
    }

    create_directories(new_structure, new_base_dir)
    copy_config_files(old_structure, new_structure, old_base_dir, new_base_dir)
    update_categories_csv(new_base_dir)
    copy_salkkuraportti(old_base_dir, new_base_dir)
    copy_input_files(old_base_dir, new_base_dir)
    copy_data_csv(old_base_dir, new_base_dir)
    copy_config_from_repository(repository_config_dir, new_base_dir)
    logging.info("migration completed successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="migrate directory structure from v1 to v2"
    )
    parser.add_argument(
        "old_base_dir", help="path to the old base directory (e.g. fire_data)"
    )
    parser.add_argument(
        "new_base_dir", help="path to the new base directory (e.g. fire_data_20250101)"
    )
    args = parser.parse_args()

    migrate_structure(args.old_base_dir, args.new_base_dir)


# example usage: navigate to migration_scripts folder and run python migrate_from_v1_to_v2.py /mnt/c/a/repos/fire_data/ /mnt/c/a/repos/fire_data_20250101
