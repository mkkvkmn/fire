import sys
import os
import pytest
import pandas as pd

# add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

from source_file_reader.files_csv_to_yml import csv_to_yml


def test_csv_to_yml_valid():
    # create a temporary DataFrame with valid data
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

    # run the csv_to_yml function
    csv_to_yml(df, "tests/data")

    # check if the .yml file is created
    yml_file = "tests/data/s-pankki.yml"
    assert os.path.exists(yml_file)

    # read the .yml file and check its contents
    with open(yml_file, "r", encoding="utf-8") as f:
        yml_data = f.read()
        assert '"id": "1' in yml_data
        assert '"pattern": "s-pankki"' in yml_data
        assert '"account": "s-pankki"' in yml_data
        assert '"delimiter": ";"' in yml_data
        assert '"date_format": "%d.%m.%Y"' in yml_data
        assert '"day_first": "True"' in yml_data
        assert '"date": "TransactionDate"' in yml_data
        assert '"amount": "Amount"' in yml_data
        assert '"description": "Text"' in yml_data
        assert '"info": "Merchant Category"' in yml_data

    # cleanup: remove the generated .yml file
    os.remove(yml_file)


def test_csv_to_yml_missing_columns():
    # create a temporary df with missing column info
    data = {
        "id": ["1"],
        "pattern": ["s-pankki"],
        "account": ["s-pankki"],
        "delimiter": [";"],
        "date_format": ["%d.%m.%Y"],
        "day_first": [True],
        "columns": [
            "{'TransactionDate': 'date', 'Amount': 'amount', 'Text': 'description'}"
        ],
    }
    df = pd.DataFrame(data)

    # run the csv_to_yml function and check for ValueError
    with pytest.raises(ValueError, match=r"missing columns:.*info"):
        csv_to_yml(df, "tests/data")


def test_csv_to_yml_missing_fields():
    # create a temporary DataFrame with missing fields
    data = {
        "id": ["1"],
        "pattern": ["s-pankki"],
        "account": [None],
        "delimiter": [";"],
        "date_format": ["%d.%m.%Y"],
        "day_first": [True],
        "columns": [
            "{'TransactionDate': 'date', 'Amount': 'amount', 'Text': 'description', 'Merchant Category': 'info'}"
        ],
    }
    df = pd.DataFrame(data)

    # run the csv_to_yml function and check for ValueError
    with pytest.raises(ValueError, match=r"missing fields:.*account"):
        csv_to_yml(df, "tests/data")


if __name__ == "__main__":
    pytest.main()
