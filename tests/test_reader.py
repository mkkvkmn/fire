import sys
import os
import pytest
import pandas as pd

# add the project root and root/src to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

from utils.helpers import detect_encoding
from source_file_reader.reader import (
    read_csv_file,
    read_excel_file,
    read_files_config_file,
)


def test_read_csv_file():
    # test reading a valid CSV file
    df = read_csv_file("tests/data/valid.csv")
    assert not df.empty

    # Test reading a non-existent CSV file
    with pytest.raises(Exception):
        read_csv_file("tests/data/non_existent.csv")


def test_read_excel_file():
    # test reading a valid Excel file
    df = read_excel_file("tests/data/valid.xlsx")
    assert not df.empty

    # Test reading a non-existent Excel file
    with pytest.raises(Exception):
        read_excel_file("tests/data/non_existent.xlsx")


def test_read_files_config_file():
    # test reading a valid config file
    df = read_files_config_file("config/source_file_reader/files.csv")
    assert not df.empty

    # Test reading a non-existent config file
    with pytest.raises(Exception):
        read_files_config_file("tests/data/non_existent_config.csv")
