import logging
import os
import pandas as pd
import yaml
import ast


def quoted_presenter(dumper, data):
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style='"')


yaml.add_representer(str, quoted_presenter)


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

                yml_data = {
                    "pattern": row.get("pattern"),
                    "account": row.get("account"),
                    "delimiter": row.get("delimiter"),
                    "date_format": row.get("date_format"),
                    "day_first": str(row.get("day_first")),
                    "columns": {
                        "date": reverse_columns.get("date"),
                        "amount": reverse_columns.get("amount"),
                        "description": reverse_columns.get("description"),
                        "info": reverse_columns.get("info"),
                    },
                }

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
                        yml_data, yml_file, default_flow_style=False, allow_unicode=True
                    )
                logging.info(f"created: {os.path.basename(yml_file_path)}")
    except Exception as e:
        logging.error(f"error - csv_to_yml: {e}")
        raise


if __name__ == "__main__":
    # example usage
    data = {
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
