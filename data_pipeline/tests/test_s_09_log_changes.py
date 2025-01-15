import pytest
import pandas as pd
from unittest.mock import patch
from data_pipeline.src.data_processing.s_09_log_changes import (
    log_categorization_and_id_changes,
)


def test_log_categorization_and_id_changes_valid_categorization_changes(tmpdir):
    # create temporary dataframes with valid data
    data_current = {
        "not_unique_id": ["1", "2", "3"],
        "date": ["2021-01-01", "2021-01-02", "2021-01-03"],
        "description": ["desc1", "desc2", "desc3"],
        "info": ["info1", "info2", "info3"],
        "amount": [100, 200, 300],
        "rule_id": ["rule1", "rule2", "rule3"],
        "owner": ["owner1", "owner2", "owner3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
    }
    df_current = pd.DataFrame(data_current)

    data_new = {
        "not_unique_id": ["1", "2", "3"],
        "date": ["2021-01-01", "2021-01-02", "2021-01-03"],
        "description": ["desc1", "desc2", "desc3"],
        "info": ["info1", "info2", "info3"],
        "amount": [100, 200, 300],
        "rule_id": ["rule1", "rule2", "rule3"],
        "owner": ["owner1", "owner2", "owner3"],
        "class": ["class1_changed", "class2", "class3"],  # changed
        "category": ["category1", "category2_changed", "category3"],  # changed
        "sub_category": ["sub1", "sub2", "sub3_changed"],  # changed
    }
    df_new = pd.DataFrame(data_new)

    # run the log_categorization_and_id_changes function with mocked input
    output_dir = tmpdir.mkdir("intermediate")
    with patch("builtins.input", return_value="y"):
        log_categorization_and_id_changes(df_new, df_current, str(output_dir))

    # check if the changes file is created
    changes_files = list(output_dir.listdir())
    changes_files = [
        f for f in changes_files if f.basename.startswith("category_changes_")
    ]
    assert len(changes_files) > 0
    changes_file_path = changes_files[0]

    # read the changes file and check its contents
    changes = pd.read_csv(changes_file_path)
    assert len(changes) == 3
    assert "not_unique_id" in changes.columns
    assert "class_current" in changes.columns
    assert "class_new" in changes.columns
    assert "category_current" in changes.columns
    assert "category_new" in changes.columns
    assert "sub_category_current" in changes.columns
    assert "sub_category_new" in changes.columns


def test_log_categorization_and_id_changes_valid_id_changes(tmpdir):
    # create temporary dataframes with valid data
    data_current = {
        "not_unique_id": ["1", "2", "3"],
        "date": ["2021-01-01", "2021-01-02", "2021-01-03"],
        "description": ["desc1", "desc2", "desc3"],
        "info": ["info1", "info2", "info3"],
        "amount": [100, 200, 300],
        "rule_id": ["rule1", "rule2", "rule3"],
        "owner": ["owner1", "owner2", "owner3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
    }
    df_current = pd.DataFrame(data_current)

    data_new = {
        "not_unique_id": ["1", "2", "3_changed"],  # changed
        "date": ["2021-01-01", "2021-01-02", "2021-01-03"],
        "description": ["desc1", "desc2", "desc3"],
        "info": ["info1", "info2", "info3"],
        "amount": [100, 200, 300],
        "rule_id": ["rule1", "rule2", "rule3"],
        "owner": ["owner1", "owner2", "owner3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
    }
    df_new = pd.DataFrame(data_new)

    # run the log_categorization_and_id_changes function with mocked input
    output_dir = tmpdir.mkdir("intermediate")
    with patch("builtins.input", return_value="y"):
        log_categorization_and_id_changes(df_new, df_current, str(output_dir))

    # check if the changes file is created
    changes_files = list(output_dir.listdir())
    print(changes_files)
    changes_files = [f for f in changes_files if f.basename.startswith("id_changes_")]
    assert len(changes_files) > 0
    changes_file_path = changes_files[0]

    # read the changes file and check its contents
    changes = pd.read_csv(changes_file_path)
    assert len(changes) == 1


def test_log_categorization_and_id_changes_no_changes(tmpdir):
    # create temporary dataframes with no changes
    data_current = {
        "not_unique_id": ["1", "2", "3"],
        "date_current": ["2021-01-01", "2021-01-02", "2021-01-03"],
        "description_current": ["desc1", "desc2", "desc3"],
        "info_current": ["info1", "info2", "info3"],
        "amount_current": [100, 200, 300],
        "rule_id_current": ["rule1", "rule2", "rule3"],
        "owner_current": ["owner1", "owner2", "owner3"],
        "class_current": ["class1", "class2", "class3"],
        "category_current": ["category1", "category2", "category3"],
        "sub_category_current": ["sub1", "sub2", "sub3"],
    }
    df_current = pd.DataFrame(data_current)

    data_new = {
        "not_unique_id": ["1", "2", "3"],
        "date_new": ["2021-01-01", "2021-01-02", "2021-01-03"],
        "description_new": ["desc1", "desc2", "desc3"],
        "info_new": ["info1", "info2", "info3"],
        "amount_new": [100, 200, 300],
        "rule_id_new": ["rule1", "rule2", "rule3"],
        "owner_new": ["owner1", "owner2", "owner3"],
        "class_new": ["class1", "class2", "class3"],
        "category_new": ["category1", "category2", "category3"],
        "sub_category_new": ["sub1", "sub2", "sub3"],
    }
    df_new = pd.DataFrame(data_new)

    # run the log_categorization_and_id_changes function with mocked input
    output_dir = tmpdir.mkdir("intermediate")
    with patch("builtins.input", return_value="y"):
        log_categorization_and_id_changes(df_new, df_current, str(output_dir))

    # check if the changes file is created
    changes_files = list(output_dir.listdir())
    assert len(changes_files) == 0


if __name__ == "__main__":
    pytest.main()
