import os
import shutil
import argparse


def migrate_structure(old_base_dir, new_base_dir):
    # define old and new directory structures
    old_structure = {
        "config": ["categories.csv", "files.csv", "fix.csv", "splits.csv"],
        "extensions/nordnet": ["salkkuraportti.csv"],
        "input": [],  # all files in the input folder will be copied, excluding nnsr.csv
        "output": ["data.csv"],
    }

    new_structure = {
        "config/source_file_reader": ["files.csv"],
        "config/data_processing": ["categories.csv", "fixes.csv", "splits.csv"],
        "data/source_files": [],  # all files from the old input folder will be copied here, excluding nnsr.csv
        "data/source_files/for_preprocessors/nordnet": ["nordnet_salkkuraportti.csv"],
        "data/final": ["final_data.csv"],
    }

    # create new directories if they don't exist
    for new_dir in new_structure.keys():
        os.makedirs(os.path.join(new_base_dir, new_dir), exist_ok=True)

    # copy config files and handle renaming of fix.csv to fixes.csv
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
                        print(f"copied {old_path} to {new_path}")

    # copy and rename salkkuraportti.csv to nordnet_salkkuraportti.csv
    old_salkkuraportti_path = os.path.join(
        old_base_dir, "extensions/nordnet/salkkuraportti.csv"
    )
    new_salkkuraportti_path = os.path.join(
        new_base_dir,
        "data/source_files/for_preprocessors/nordnet/nordnet_salkkuraportti.csv",
    )
    if os.path.exists(old_salkkuraportti_path):
        shutil.copy2(old_salkkuraportti_path, new_salkkuraportti_path)
        print(f"copied {old_salkkuraportti_path} to {new_salkkuraportti_path}")

    # copy all files from the old input folder to the new data/source_files folder, excluding nnsr.csv
    old_input_folder = os.path.join(old_base_dir, "input")
    new_source_files_folder = os.path.join(new_base_dir, "data/source_files")
    if os.path.exists(old_input_folder):
        for file_name in os.listdir(old_input_folder):
            if file_name == "nnsr.csv":
                continue
            old_file_path = os.path.join(old_input_folder, file_name)
            new_file_path = os.path.join(new_source_files_folder, file_name)
            if os.path.isfile(old_file_path):
                shutil.copy2(old_file_path, new_file_path)
                print(f"copied {old_file_path} to {new_file_path}")

    # replace nnsr.csv with nordnet_salkkuraportti_preprocessed.csv and nnsr with nordnet_salkkuraportti in files.csv
    files_csv_path = os.path.join(new_base_dir, "config/source_file_reader/files.csv")
    if os.path.exists(files_csv_path):
        with open(files_csv_path, "r") as file:
            content = file.read()
        content = content.replace("nnsr.csv", "nordnet_salkkuraportti_preprocessed.csv")
        content = content.replace("nnsr", "nordnet_salkkuraportti")
        with open(files_csv_path, "w") as file:
            file.write(content)
        print(f"updated {files_csv_path}")

    # replace nnsr with nordnet_salkkuraportti in categories.csv
    categories_csv_path = os.path.join(
        new_base_dir, "config/data_processing/categories.csv"
    )
    if os.path.exists(categories_csv_path):
        with open(categories_csv_path, "r") as file:
            content = file.read()
        content = content.replace("nnsr", "nordnet_salkkuraportti")
        content = content.replace(",nn,", ",nordnet_salkkuraportti,")
        with open(categories_csv_path, "w") as file:
            file.write(content)
        print(f"updated {categories_csv_path}")

    print("migration completed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="migrate directory structure.")
    parser.add_argument("old_base_dir", help="the base directory of the old structure.")
    parser.add_argument("new_base_dir", help="the base directory of the new structure.")
    args = parser.parse_args()

    migrate_structure(args.old_base_dir, args.new_base_dir)

    # example usage:
    # python migrate_from_v1_to_v2.py /path/to/old/data /path/to/new/root
