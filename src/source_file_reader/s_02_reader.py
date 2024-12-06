import logging
import os
import pandas as pd
import re
import yaml

from pprint import pformat
from utils.helpers import detect_encoding


def read_csv_file(
    file_path: str, encoding: str = None, delimiter: str = ","
) -> pd.DataFrame:
    """
    reads a csv file and returns a dataframe.

    :param file_path: path to the csv file.
    :param encoding: encoding of the csv file. if None, detect encoding.
    :param delimiter: delimiter of the csv file. default is ','.
    :return: dataframe containing the csv data.
    """
    try:
        if encoding is None:
            encoding = detect_encoding(file_path)

        logging.info(f"read csv: {os.path.basename(file_path)} ({encoding})")
        df = pd.read_csv(
            file_path,
            encoding=encoding,
            delimiter=delimiter,
            dtype=str,
            engine="python",
        )
        logging.debug(f"-> ok: {os.path.basename(file_path)}")
        return df
    except UnicodeDecodeError as e:
        logging.error(f"unicode decode error reading csv file {file_path}: {e}")
        raise
    except Exception as e:
        logging.error(f"error - read_csv_file {file_path}: {e}")
        raise


def read_excel_file(file_path: str) -> pd.DataFrame:
    """
    reads an excel file and returns a dataframe.

    :param file_path: path to the excel file.
    :return: dataframe containing the excel data.
    """
    try:
        logging.info(f"read excel: {os.path.basename(file_path)}")
        df = pd.read_excel(file_path, dtype=str)
        logging.debug(f"-> ok: {os.path.basename(file_path)}")
        return df
    except Exception as e:
        logging.error(f"error - read_excel_file {file_path}: {e}")
        raise


def read_yaml_file(file_path: str) -> dict:
    """
    reads a yaml file and returns a dictionary.

    :param file_path: path to the yaml file.
    :return: dictionary containing the yaml data.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = yaml.safe_load(file)
        logging.debug(f"read yaml: {os.path.basename(file_path)}")
        return data
    except Exception as e:
        logging.error(f"error - read_yaml_file {file_path}: {e}")
        raise


def collect_files(input_folder: str, yml_directory: str) -> dict:
    """
    collects files from the input folder based on the configuration files in the yml directory.

    :param input_folder: path to the input folder.
    :param yml_directory: directory containing the yml configuration files.
    :return: dictionary containing file information.
    """
    try:
        file_info = {}
        files_to_process = [
            file
            for file in os.listdir(input_folder)
            if os.path.isfile(os.path.join(input_folder, file)) and "~" not in file
        ]  # exclude directories and temporary files

        yml_files = [
            os.path.join(yml_directory, file)
            for file in os.listdir(yml_directory)
            if file.endswith(".yml")
        ]

        for file in files_to_process:
            file_path = os.path.join(input_folder, file)
            matched = False

            for yml_file in yml_files:
                config = read_yaml_file(yml_file)
                pattern = config.get("pattern")

                if re.match(pattern, file):
                    file_info[file_path] = {
                        "file_name": file,
                        "account": config.get("account"),
                        "encoding": detect_encoding(file_path),
                        "file_path": file_path,
                        "pattern": f"{pattern}",
                        "delimiter": config.get("delimiter"),
                        "date_format": config.get("date_format"),
                        "day_first": config.get("day_first"),
                        "columns": config.get("columns"),
                    }
                    matched = True

                    logging.debug(
                        f"config found: {os.path.basename(file_path)}\n"
                        + f"properties:\n{pformat(file_info[file_path])}"
                    )
                    break

            if not matched:
                raise ValueError(
                    f"no pattern found for {file}. add it to the yml configuration files"
                )

        logging.info(f"found files: {len(file_info)}")
        return file_info
    except Exception as e:
        logging.error(f"error - collect_files {input_folder}: {e}")
        raise


def read_collected_files(file_info: dict) -> dict:
    """
    reads files based on the provided file information.

    :param file_info: dictionary containing file information.
    :return: dictionary containing dataframes of the read files.
    """
    dataframes = {}
    for file_path, info in file_info.items():
        try:
            if info["file_name"].endswith(".csv"):
                df = read_csv_file(
                    file_path, encoding=info["encoding"], delimiter=info["delimiter"]
                )
            elif info["file_name"].endswith(".xlsx"):
                df = read_excel_file(file_path)
            else:
                logging.warning(f"unsupported file type: {file_path}")
                raise ValueError(f"unsupported file type: {file_path}")
            dataframes[file_path] = {"dataframe": df, "props": info}
        except Exception as e:
            logging.error(f"error - read_collected_files {file_path}: {e}")
            raise
    return dataframes
