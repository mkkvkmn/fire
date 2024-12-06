import sys
import os
import pytest
import pandas as pd

# add the project root and root/src to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

from data_processing.s_03_loader import append_dataframes
from utils.helpers import create_id, parse_date


def test_append_dataframes_valid():
    # create temporary DataFrames with valid data
    data1 = {
        "TransactionDate": ["2023-01-01", "2023-01-02"],
        "Amount": [100.0, 200.0],
        "Text": ["Description 1", "Description 2"],
        "Merchant Category": ["Info 1", "Info 2"],
    }
    df1 = pd.DataFrame(data1)

    data2 = {
        "TransactionDate": ["2023-01-03", "2023-01-04"],
        "Amount": [300.0, 400.0],
        "Text": ["Description 3", "Description 4"],
        "Merchant Category": ["Info 3", "Info 4"],
    }
    df2 = pd.DataFrame(data2)

    dataframes = {
        "file1.csv": {
            "dataframe": df1,
            "props": {
                "columns": {
                    "date": "TransactionDate",
                    "amount": "Amount",
                    "description": "Text",
                    "info": "Merchant Category",
                },
                "account": "account1",
                "file_name": "file1.csv",
                "date_format": "%Y-%m-%d",
                "day_first": False,
            },
        },
        "file2.csv": {
            "dataframe": df2,
            "props": {
                "columns": {
                    "date": "TransactionDate",
                    "amount": "Amount",
                    "description": "Text",
                    "info": "Merchant Category",
                },
                "account": "account2",
                "file_name": "file2.csv",
                "date_format": "%Y-%m-%d",
                "day_first": False,
            },
        },
    }

    # run the append_dataframes function
    df_all = append_dataframes(dataframes)

    # check if the DataFrame is appended correctly
    assert not df_all.empty
    assert len(df_all) == 4
    assert "date" in df_all.columns
    assert "account" in df_all.columns
    assert "description" in df_all.columns
    assert "info" in df_all.columns
    assert "amount" in df_all.columns
    assert "record_type" in df_all.columns
    assert "source_file" in df_all.columns
    assert "transaction_id" in df_all.columns


def test_append_dataframes_missing_columns():
    # create a temporary DataFrame with missing columns
    data = {
        "TransactionDate": ["2023-01-01", "2023-01-02"],
        "Amount": [100.0, 200.0],
        "Text": ["Description 1", "Description 2"],
    }
    df = pd.DataFrame(data)

    dataframes = {
        "file1.csv": {
            "dataframe": df,
            "props": {
                "columns": {
                    "date": "TransactionDate",
                    "amount": "Amount",
                    "description": "Text",
                    # "info": "Merchant Category", # missing column
                },
                "account": "account1",
                "file_name": "file1.csv",
                "date_format": "%Y-%m-%d",
                "day_first": False,
            },
        },
    }

    # run the append_dataframes function and check for KeyError
    with pytest.raises(KeyError, match=r"missing required columns: \['info'\]"):
        append_dataframes(dataframes)


if __name__ == "__main__":
    pytest.main()
