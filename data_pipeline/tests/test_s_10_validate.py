import pytest
import pandas as pd
from unittest.mock import patch
from data_pipeline.src.data_processing.s_10_validate import validate_not_unique_id


def test_validate_not_unique_id_no_duplicates(tmpdir):
    # create a temporary DataFrame with no duplicates
    data = {
        "not_unique_id": ["1", "2", "3"],
        "class": ["class1", "class2", "class3"],
        "category": ["category1", "category2", "category3"],
        "sub_category": ["sub1", "sub2", "sub3"],
        "amount": [100, 200, 300],
    }
    df = pd.DataFrame(data)

    # run the validate_not_unique_id function
    output_dir = tmpdir.mkdir("intermediate")
    with patch("builtins.input", return_value="y"):
        validate_not_unique_id(df, str(output_dir))

    # check that no duplicates file is created
    duplicates_files = list(output_dir.listdir())
    assert len(duplicates_files) == 0


def test_validate_not_unique_id_with_duplicates(tmpdir):
    # create a temporary DataFrame with duplicates
    data = {
        "not_unique_id": ["1", "2", "2"],
        "class": ["class1", "class2", "class2"],
        "category": ["category1", "category2", "category2"],
        "sub_category": ["sub1", "sub2", "sub2"],
        "amount": [100, 200, 200],
    }
    df = pd.DataFrame(data)

    # run the validate_not_unique_id function
    output_dir = tmpdir.mkdir("intermediate")
    with patch("builtins.input", return_value="y"):
        validate_not_unique_id(df, str(output_dir))

    # check that a duplicates file is created
    duplicates_files = list(output_dir.listdir())
    duplicates_files = [
        f for f in duplicates_files if f.basename.startswith("accepted_")
    ]
    assert len(duplicates_files) == 1
    duplicates_file_path = duplicates_files[0]

    # read the duplicates file and check its contents
    duplicates = pd.read_csv(duplicates_file_path)
    assert len(duplicates) == 1
    assert "not_unique_id" in duplicates.columns


if __name__ == "__main__":
    pytest.main()
