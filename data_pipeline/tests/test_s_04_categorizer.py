import sys
import os

import pytest
import pandas as pd
from data_pipeline.src.data_processing.s_04_categorizer import categorize_data


def test_categorize_data():
    # input dataframe similar to 1_loaded.csv
    df = pd.DataFrame(
        {
            "transaction_id": [
                "7064b8289bdd37d62a05c9bae3721e7db926b4558025575798ebc7ab8bdef60c",
                "787d261fabb57f4ad8e800c9c196fe5f0018ca11b0547e35ab19dc2e90f7f843",
            ],
            "date": ["2023-12-01", "2023-12-02"],
            "account": ["luottokortti", "luottokortti"],
            "description": ["Netflix", "Spotify"],
            "info": [
                "MEMBER ORGANIZATIONS - DEF",
                "DIGITAL GOODS – LARGE DIGITAL GOODS MERCHANT",
            ],
            "amount": [-11.65, -12.99],
            "source_file": ["luottokortti.xlsx", "luottokortti.xlsx"],
            "record_type": ["Actual", "Actual"],
        }
    )

    # rules dataframe similar to categories.csv
    categories_df = pd.DataFrame(
        {
            "id": ["3", "8"],
            "account": ["luottokortti", "luottokortti"],
            "description": ["Netflix", "Spotify"],
            "info": [
                "MEMBER ORGANIZATIONS - DEF",
                "DIGITAL GOODS – LARGE DIGITAL GOODS MERCHANT",
            ],
            "amount": ["neg", "neg"],  # include the 'amount' column in rules
            "class": ["menot", "menot"],
            "category": ["media", "media"],
            "sub_category": ["suoratoisto", "musiikki"],
        }
    )

    # categorize the data
    categorized_df = categorize_data(df, categories_df)

    # assert that the new columns are present
    assert "class" in categorized_df.columns
    assert "category" in categorized_df.columns
    assert "sub_category" in categorized_df.columns
    assert "rule_id" in categorized_df.columns

    # assert that the values are correctly categorized
    assert categorized_df.loc[0, "class"] == "menot"
    assert categorized_df.loc[0, "category"] == "media"
    assert categorized_df.loc[0, "sub_category"] == "suoratoisto"
    assert categorized_df.loc[0, "rule_id"] == "3"
    assert categorized_df.loc[0, "record_type"] == "Actual"

    assert categorized_df.loc[1, "class"] == "menot"
    assert categorized_df.loc[1, "category"] == "media"
    assert categorized_df.loc[1, "sub_category"] == "musiikki"
    assert categorized_df.loc[1, "rule_id"] == "8"
    assert categorized_df.loc[1, "record_type"] == "Actual"


if __name__ == "__main__":
    pytest.main()
