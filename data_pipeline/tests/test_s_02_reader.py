import sys
import os
import pytest
import pandas as pd


from data_pipeline.src.utils.helpers import detect_encoding
from data_pipeline.src.source_file_reader.s_02_reader import (
    read_csv_file,
    read_excel_file,
    read_yaml_file,
)


def test_read_csv_file():
    # test reading a valid CSV file
    df = read_csv_file("data_pipeline/tests/data/valid.csv")
    assert not df.empty

    # test reading a non-existent CSV file
    with pytest.raises(Exception):
        read_csv_file("./data/non_existent.csv")


def test_read_excel_file():
    # test reading a valid Excel file
    df = read_excel_file("data_pipeline/tests/data/valid.xlsx")
    assert not df.empty

    # test reading a non-existent Excel file
    with pytest.raises(Exception):
        read_excel_file("./data/non_existent.xlsx")


def test_read_yaml_file():
    # create a temporary YAML file with valid data
    yaml_file = "data_pipeline/tests/data/valid.yml"
    yaml_data = """
    pattern: s-pankki
    account: s-pankki
    delimiter: ";"
    date_format: "%d.%m.%Y"
    day_first: true
    columns:
      date: TransactionDate
      amount: Amount
      description: Text
      info: Merchant Category
    """
    os.makedirs(os.path.dirname(yaml_file), exist_ok=True)
    with open(yaml_file, "w", encoding="utf-8") as f:
        f.write(yaml_data)

    # test reading a valid YAML file
    data = read_yaml_file(yaml_file)
    assert data["pattern"] == "s-pankki"
    assert data["account"] == "s-pankki"
    assert data["delimiter"] == ";"
    assert data["date_format"] == "%d.%m.%Y"
    assert data["day_first"] is True
    assert data["columns"]["date"] == "TransactionDate"
    assert data["columns"]["amount"] == "Amount"
    assert data["columns"]["description"] == "Text"
    assert data["columns"]["info"] == "Merchant Category"

    # test reading a non-existent YAML file
    with pytest.raises(Exception):
        read_yaml_file("tests/data/non_existent.yml")

    # cleanup: remove the generated YAML file
    os.remove(yaml_file)


if __name__ == "__main__":
    pytest.main()
