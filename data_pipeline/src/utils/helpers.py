import os
import logging
import chardet
import numpy as np
import pandas as pd
import hashlib
import re

from config.settings import SETTINGS


def create_id(row: pd.Series) -> str:
    """
    creates a unique ID for a row by concatenating its values into a string,
    replacing common special characters with underscores.

    :param row: The row for which to create the ID (expects a dictionary).
    :return: The created ID as a concatenated string.
    """
    formatted_values = []
    for key, value in row.items():
        if pd.isna(value):
            formatted_values.append("")
        elif isinstance(value, str):
            formatted_values.append(value)
        elif isinstance(value, pd.Timestamp):
            formatted_values.append(value.strftime("%Y%m%d"))
        else:
            formatted_values.append(str(value))

    # concatenate row values into a single string separated by '__'
    row_str = "__".join(formatted_values).lower()

    # replace spaces and common special characters
    row_str = re.sub(
        r"[\s\-\,\.\+\!\@\#\$\%\^\&\*\(\)\=\{\}\[\]\|\:\;\"\'\<\>\?\/\\]", "", row_str
    )

    print(formatted_values)
    print(row_str)

    return row_str


def save_on_debug(df, file_path):
    """
    saves the dataframe to a csv file if debugging is enabled.

    :param df: dataframe to be saved.
    :param filename: name of the file to save the dataframe.
    :param debug: boolean flag indicating if debugging is enabled.
    """
    if SETTINGS["debug_mode"]:
        try:
            write_to_csv(df, file_path)
            logging.info(f"debug saved: {os.path.basename(file_path)}")
        except Exception as e:
            logging.error(f"error - save_on_debug {file_path}: {e}")
            raise


def detect_encoding(file_path: str) -> str:
    """
    detects the encoding of a file.

    :param file_path: path to the file.
    :return: detected encoding of the file.
    """
    try:
        with open(file_path, "rb") as f:
            rawdata = f.read()
        result = chardet.detect(rawdata)
        return result["encoding"]
    except Exception as e:
        logging.error(f"error - detect_encoding {file_path}: {e}")
        raise


def write_to_csv(data: pd.DataFrame, file_path: str) -> None:
    """
    writes a dataframe to a csv file.

    :param data: dataframe to be written to csv.
    :param file_path: path to the output csv file.
    """
    try:
        # create the directory if it doesn't exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        logging.info(f"write csv: {os.path.basename(file_path)}")
        data.to_csv(file_path, index=False)
        logging.debug(f"-> ok: {os.path.basename(file_path)}")
    except Exception as e:
        logging.error(f"error - write_to_csv {file_path}: {e}")
        raise


def has_content(value):
    """
    checks if a value has content (is not None, NaN, or empty).

    :param value: value to check.
    :return: True if the value has content, False otherwise.
    """
    if isinstance(value, (int, float)):
        return not pd.isna(value)
    return value not in [None, "", np.nan]


def parse_date(date_str, formats, dayfirst):
    """
    parses a date string into a datetime object.

    :param date_str: the date string to parse.
    :param formats: list of date formats to try.
    :param dayfirst: whether to interpret the day as the first part of the date.
    :return: the parsed datetime object.
    """
    formats_list = formats.split("|")

    for format in formats_list:
        try:
            dt = pd.to_datetime(date_str, format=format, dayfirst=dayfirst)
            return dt.floor("D")
        except ValueError:
            continue
    return pd.NaT


def clean_folder(folder_path: str):
    """
    deletes all files in the specified folder.

    :param folder_path: Path to the folder to clean.
    """
    try:
        if not os.path.exists(folder_path):
            logging.info(f"nothing to clean: {os.path.basename(folder_path)}")
            return

        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            if os.path.isfile(file_path):
                os.unlink(file_path)
        logging.info(f"cleaned: {os.path.basename(folder_path)}")
    except Exception as e:
        logging.error(f"error - clean_folder {folder_path}: {e}")
        raise
