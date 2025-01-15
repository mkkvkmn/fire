import pytest
import pandas as pd

from data_pipeline.src.utils.helpers import clean_string
from data_pipeline.src.data_processing.s_06_add_id import add_not_unique_id


def test_add_not_unique_id():
    # create a sample dataframe
    data = {
        "date": ["2023-01-01", "2023-01-02"],
        "account": ["account1", "account2"],
        "description": ["desc1", "desc2"],
        "info": ["info1", "info2"],
        "amount_original": [100, 200],
        "row_type": ["type1", "type2"],
        "source_file": ["file1", "file2"],
        "owner": ["owner1", "owner2"],
    }
    df = pd.DataFrame(data)

    # apply the add_not_unique_id function
    df_with_id = add_not_unique_id(df)

    # check if the not_unique_id column is added
    assert "not_unique_id" in df_with_id.columns

    # check if the not_unique_id column is not empty
    assert df_with_id["not_unique_id"].isnull().sum() == 0

    # check if the not_unique_id values are correctly formatted
    for idx, row in df_with_id.iterrows():
        expected_id = f"{row['date']}__{row['account']}__{row['description']}__{row['info']}__{row['amount_original']}__{row['row_type']}__{row['source_file']}__{row['owner']}"
        expected_id = clean_string(expected_id)
        assert row["not_unique_id"] == expected_id


if __name__ == "__main__":
    pytest.main()
