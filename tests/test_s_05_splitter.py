import sys
import os

# add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

import pytest
import pandas as pd
from data_processing.s_05_splitter import split_data, create_splits_df


def test_create_splits_df():
    # create a temporary splits.csv file for testing
    splits_csv = "tests/data/splits.csv"
    splits_data = """start,end,account,share,owner
2023-06-01,2024-12-31,nordnet_salkkuraportti,0.5,mkk
2023-06-01,2024-12-31,nordnet_salkkuraportti,0.5,mrs. mkk
"""
    os.makedirs(os.path.dirname(splits_csv), exist_ok=True)
    with open(splits_csv, "w") as f:
        f.write(splits_data)

    # create the splits dataframe
    splits_df = create_splits_df(splits_csv)

    # assert that the splits dataframe is created correctly
    assert "start" in splits_df.columns
    assert "end" in splits_df.columns
    assert "account" in splits_df.columns
    assert "share" in splits_df.columns
    assert "owner" in splits_df.columns

    assert splits_df.loc[0, "start"] == pd.to_datetime("2023-06-01")
    assert splits_df.loc[0, "end"] == pd.to_datetime("2024-12-31")
    assert splits_df.loc[0, "account"] == "nordnet_salkkuraportti"
    assert splits_df.loc[0, "share"] == 0.5
    assert splits_df.loc[0, "owner"] == "mkk"

    assert splits_df.loc[1, "start"] == pd.to_datetime("2023-06-01")
    assert splits_df.loc[1, "end"] == pd.to_datetime("2024-12-31")
    assert splits_df.loc[1, "account"] == "nordnet_salkkuraportti"
    assert splits_df.loc[1, "share"] == 0.5
    assert splits_df.loc[1, "owner"] == "mrs. mkk"


def test_split_data():
    # input dataframe similar to 2_categorized.csv
    df = pd.DataFrame(
        {
            "transaction_id": [
                "74d8e4624d8525c5f37c79c5a2968b6974e891f49db394c107eec4f4f24035de",
                "2fc34542f6a4ee6c55c5fcf8815389e7d58f23a24b90c405f3a56bd2263fdc16",
            ],
            "date": ["2023-05-31", "2023-11-30"],
            "account": ["nordnet_salkkuraportti", "nordnet_salkkuraportti"],
            "description": ["Arbor Realty Trust", "Arbor Realty Trust"],
            "info": ["Salkku 1", "Salkku 1"],
            "amount": [7080.47, 6879.18],
            "class": ["varat", "varat"],
            "category": ["sijoitusvarallisuus", "sijoitusvarallisuus"],
            "sub_category": ["osinkosalkku", "osinkosalkku"],
            "rule_id": ["10", "10"],
            "source_file": ["nordnet_salkkuraportti.csv", "nordnet_salkkuraportti.csv"],
        }
    )

    # splits dataframe similar to splits.csv
    splits_df = pd.DataFrame(
        {
            "start": pd.to_datetime(["2023-06-01", "2023-06-01"]),
            "end": pd.to_datetime(["2024-12-31", "2024-12-31"]),
            "account": ["nordnet_salkkuraportti", "nordnet_salkkuraportti"],
            "share": [0.5, 0.5],
            "owner": ["mkk", "mrs. mkk"],
        }
    )

    # split the data
    split_df = split_data(df, splits_df)

    # assert that the new columns are present
    assert "share" in split_df.columns
    assert "amount" in split_df.columns
    assert "owner" in split_df.columns
    assert "split" in split_df.columns
    assert "transaction_row_id" in split_df.columns

    # assert that the values are not split as the split dates are in the future
    assert split_df.loc[0, "share"] == 1.0
    assert split_df.loc[0, "amount"] == 7080.47
    assert split_df.loc[0, "owner"] == "mkk"
    assert split_df.loc[0, "split"] == False

    # assert that the split values are correctly added for both owners
    assert split_df.loc[1, "share"] == 0.5
    assert split_df.loc[1, "amount"] == 3439.59
    assert split_df.loc[1, "owner"] == "mkk"
    assert split_df.loc[1, "split"] == True

    assert split_df.loc[2, "share"] == 0.5
    assert split_df.loc[2, "amount"] == 3439.59
    assert split_df.loc[2, "owner"] == "mrs. mkk"
    assert split_df.loc[2, "split"] == True


if __name__ == "__main__":
    pytest.main()
