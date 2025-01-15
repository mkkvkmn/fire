import sys
import os

import pytest
import pandas as pd
from data_pipeline.src.data_processing.s_08_target_setter import set_targets


def test_set_targets():
    # create a temporary targets.csv file for testing
    targets_csv = "data_pipeline/tests/data/targets.csv"
    targets_data = """target_name,start,end,owner,monthly_target_amount,class,category,sub_category
Säästötavoite 1,2023-01-01,2024-12-31,mkk,500,menot,,
"""
    os.makedirs(os.path.dirname(targets_csv), exist_ok=True)
    with open(targets_csv, "w") as f:
        f.write(targets_data)

    # read the targets file
    df_targets = pd.read_csv(targets_csv)

    # set the targets
    df_monthly_targets = set_targets(df_targets)

    # assert that the targets dataframe is created correctly
    assert "not_unique_id" in df_monthly_targets.columns
    assert "date" in df_monthly_targets.columns
    assert "account" in df_monthly_targets.columns
    assert "description" in df_monthly_targets.columns
    assert "info" in df_monthly_targets.columns
    assert "amount_original" in df_monthly_targets.columns
    assert "class" in df_monthly_targets.columns
    assert "category" in df_monthly_targets.columns
    assert "sub_category" in df_monthly_targets.columns
    assert "rule_id" in df_monthly_targets.columns
    assert "source_file" in df_monthly_targets.columns
    assert "row_type" in df_monthly_targets.columns
    assert "share" in df_monthly_targets.columns
    assert "amount" in df_monthly_targets.columns
    assert "owner" in df_monthly_targets.columns
    assert "split" in df_monthly_targets.columns
    assert "not_unique_id" in df_monthly_targets.columns

    # assert that the values are correctly set
    assert df_monthly_targets.loc[0, "date"] == pd.to_datetime("2023-01-31")
    assert df_monthly_targets.loc[0, "account"] == "Target"
    assert df_monthly_targets.loc[0, "description"] == "Säästötavoite 1"
    assert df_monthly_targets.loc[0, "amount_original"] == 500
    assert df_monthly_targets.loc[0, "class"] == "menot"
    assert df_monthly_targets.loc[0, "category"] == ""
    assert df_monthly_targets.loc[0, "sub_category"] == ""
    assert df_monthly_targets.loc[0, "rule_id"] == "Säästötavoite 1"
    assert df_monthly_targets.loc[0, "source_file"] == "targets.csv"
    assert df_monthly_targets.loc[0, "row_type"] == "Target"
    assert df_monthly_targets.loc[0, "share"] == 1
    assert df_monthly_targets.loc[0, "amount"] == 500
    assert df_monthly_targets.loc[0, "owner"] == "mkk"
    assert df_monthly_targets.loc[0, "split"] == False
    assert (
        df_monthly_targets.loc[0, "not_unique_id"]
        == "20230131__target__säästötavoite1__500__target__mkk"
    )


if __name__ == "__main__":
    pytest.main()
