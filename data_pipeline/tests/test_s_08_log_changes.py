import sys
import os
import pytest
import pandas as pd
from datetime import datetime

from data_pipeline.src.data_processing.s_08_log_changes import (
    log_categorization_changes,
)


def test_log_categorization_changes_valid(tmpdir):
    # create temporary dataframes with valid data
    data_current = {
        "transaction_row_id": ["1", "2", "3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
    }
    df_current = pd.DataFrame(data_current)

    data_new = {
        "transaction_row_id": ["1", "2", "3"],
        "class": ["class1_changed", "class2", "class3"],
        "category": ["category1", "category2_changed", "category3"],
        "sub_category": ["sub1", "sub2", "sub3_changed"],
    }
    df_new = pd.DataFrame(data_new)

    # run the log_categorization_changes function
    output_dir = tmpdir.mkdir("intermediate")
    log_categorization_changes(df_new, df_current, str(output_dir))

    # check if the changes file is created
    changes_files = list(output_dir.listdir())
    assert len(changes_files) == 1
    changes_file_path = changes_files[0]

    # read the changes file and check its contents
    changes = pd.read_csv(changes_file_path)
    assert len(changes) == 3
    assert "transaction_row_id" in changes.columns
    assert "class_current" in changes.columns
    assert "class_new" in changes.columns
    assert "category_current" in changes.columns
    assert "category_new" in changes.columns
    assert "sub_category_current" in changes.columns
    assert "sub_category_new" in changes.columns


def test_log_categorization_changes_no_changes(tmpdir):
    # create temporary dataframes with no changes
    data_current = {
        "transaction_row_id": ["1", "2", "3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
    }
    df_current = pd.DataFrame(data_current)

    data_new = {
        "transaction_row_id": ["1", "2", "3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
    }
    df_new = pd.DataFrame(data_new)

    # run the log_categorization_changes function
    output_dir = tmpdir.mkdir("intermediate")
    log_categorization_changes(df_new, df_current, str(output_dir))

    # check if the changes file is created
    changes_files = list(output_dir.listdir())
    assert len(changes_files) == 0


if __name__ == "__main__":
    pytest.main()
