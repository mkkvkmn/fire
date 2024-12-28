import logging
import os
import pandas as pd
import yaml
import ast
from collections import OrderedDict


def quoted_presenter(dumper, data):
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style='"')


def ordered_dict_presenter(dumper, data):
    return dumper.represent_dict(data.items())


yaml.add_representer(str, quoted_presenter, Dumper=yaml.SafeDumper)
yaml.add_representer(OrderedDict, ordered_dict_presenter, Dumper=yaml.SafeDumper)


def csv_to_yml(df: pd.DataFrame, yml_directory: str):
    """
    converts each row in the csv file to a .yml file if it does not already exist.

    :param df: dataframe containing the csv data.
    :param yml_directory: directory to save the .yml files.
    """

    logging.info("create .yml files from files.csv")

    try:
        # ensure the yml directory exists
        os.makedirs(yml_directory, exist_ok=True)

        for _, row in df.iterrows():
            pattern = row["pattern"]
            yml_file_path = os.path.join(yml_directory, f"{pattern}.yml")

            # check if the .yml file already exists
            if not os.path.exists(yml_file_path):
                # parse the columns field
                columns = ast.literal_eval(row["columns"])

                # reverse the mapping to find the keys for standard fields
                reverse_columns = {v: k for k, v in columns.items()}

                yml_data = OrderedDict(
                    [
                        ("id", row.get("id")),
                        ("pattern", row.get("pattern")),
                        ("account", row.get("account")),
                        ("delimiter", row.get("delimiter")),
                        ("date_format", row.get("date_format")),
                        ("day_first", str(row.get("day_first"))),
                        (
                            "columns",
                            OrderedDict(
                                [
                                    ("date", reverse_columns.get("date")),
                                    ("amount", reverse_columns.get("amount")),
                                    ("description", reverse_columns.get("description")),
                                    ("info", reverse_columns.get("info")),
                                ]
                            ),
                        ),
                    ]
                )

                # validate .yml
                missing_fields = [
                    key for key, value in yml_data.items() if value is None
                ]
                missing_columns = [
                    key for key, value in yml_data["columns"].items() if value is None
                ]

                if missing_fields or missing_columns:
                    error_message = f"\nfile {os.path.basename(yml_file_path)} could not be created\n"
                    if missing_fields:
                        error_message += (
                            f"missing fields: {', '.join(missing_fields)}\n"
                        )
                    if missing_columns:
                        error_message += (
                            f"missing columns: {', '.join(missing_columns)}"
                        )
                    error_message += "\nadd the missing columns or fields to files.csv"
                    raise ValueError(error_message.strip())

                # write the .yml file with quoted strings and correct handling of special characters
                with open(yml_file_path, "w", encoding="utf-8") as yml_file:
                    yaml.dump(
                        yml_data,
                        yml_file,
                        default_flow_style=False,
                        allow_unicode=True,
                        Dumper=yaml.SafeDumper,
                    )
                logging.info(f"created: {os.path.basename(yml_file_path)}")
    except Exception as e:
        logging.error(f"error - csv_to_yml: {e}")
        raise


def validate_yml_files(yml_directory: str):
    """
    validates all .yml files in the specified directory to ensure they have the required properties.

    :param yml_directory: directory containing the .yml files.
    """
    required_properties = [
        "id",
        "pattern",
        "account",
        "delimiter",
        "date_format",
        "day_first",
        "columns",
    ]
    required_columns = ["date", "amount", "description", "info"]

    try:
        for file_name in os.listdir(yml_directory):
            if file_name.endswith(".yml"):
                yml_file_path = os.path.join(yml_directory, file_name)
                with open(yml_file_path, "r", encoding="utf-8") as yml_file:
                    yml_data = yaml.safe_load(yml_file)

                missing_properties = [
                    prop for prop in required_properties if prop not in yml_data
                ]
                missing_columns = [
                    col for col in required_columns if col not in yml_data["columns"]
                ]

                if missing_properties or missing_columns:
                    error_message = (
                        f"\nfile {os.path.basename(yml_file_path)} has errors:\n"
                    )
                    if missing_properties:
                        error_message += (
                            f"missing properties: {', '.join(missing_properties)}\n"
                        )
                    if missing_columns:
                        error_message += (
                            f"missing columns: {', '.join(missing_columns)}"
                        )
                    raise ValueError(error_message.strip())

        logging.info("ok - all .yml files")
    except Exception as e:
        logging.error(f"error - validate_yml_files: {e}")
        raise


if __name__ == "__main__":
    # example usage
    data = {
        "id": ["1"],
        "pattern": ["s-pankki"],
        "account": ["s-pankki"],
        "delimiter": [";"],
        "date_format": ["%d.%m.%Y"],
        "day_first": [True],
        "columns": [
            "{'TransactionDate': 'date', 'Amount': 'amount', 'Text': 'description', 'Merchant Category': 'info'}"
        ],
    }
    df = pd.DataFrame(data)
    csv_to_yml(df, "src/source_file_reader")
