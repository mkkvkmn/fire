import pytest
import pandas as pd
from data_pipeline.src.data_processing.s_07_fixer import apply_fixes


def test_apply_fixes():
    # input dataframe similar to 6_add_id.csv
    df = pd.DataFrame(
        {
            "date": [
                "2023-05-31",
                "2023-11-30",
                "2023-09-30",
                "2024-02-28",
                "2023-07-31",
                "2023-01-31",
                "2023-02-27",
                "2024-01-31",
                "2023-08-31",
                "2023-10-31",
            ],
            "account": ["nordnet_salkkuraportti"] * 10,
            "description": ["Arbor Realty Trust"] * 10,
            "info": ["Salkku 1"] * 10,
            "amount_original": [
                7080.47,
                6879.18,
                8614.75,
                8239.58,
                9227.57,
                8239.58,
                8552.46,
                8239.58,
                8830.95,
                7155.15,
            ],
            "class": ["varat"] * 10,
            "category": ["sijoitusvarallisuus"] * 10,
            "sub_category": ["osinkosalkku"] * 10,
            "rule_id": ["10"] * 10,
            "source_file": ["nordnet_salkkuraportti.csv"] * 10,
            "share": [1.0] * 10,
            "amount": [
                7080.47,
                6879.18,
                8614.75,
                8239.58,
                9227.57,
                8239.58,
                8552.46,
                8239.58,
                8830.95,
                7155.15,
            ],
            "owner": ["mkk"] * 10,
            "split": [False] * 10,
            "not_unique_id": [
                "row1",
                "2fc34542f6a4ee6c55c5fcf8815389e7d58f23a24b90c405f3a56bd2263fdc16",
                "08568b96583cd2e212060ff9d33d169d6693ab89b64cc6a483adc38bf18ce418",
                "830d11c0a38dd3e971a1fbbdc768518205a8fefef385fe2e08970232995a3c7d",
                "6e375004ef78fb7891401b62622acb081ae388bdc92b0ba19e717a3a29568b73",
                "c4802f31174dcba7b17ddf3716469524f97ad52a8b5470902f4bdb799891cef0",
                "6cf5b9368b27c61b8b9a664e9ec262e89892251a57614b4673c84c783a201509",
                "b05e9de38921da5b0356d38d61679818a26e8f9b81402b650e38cb6c0eb55a36",
                "12a18dd9a05a126bd1db199b50ebacf3ac06d811a01ef32bd1a874f7250a05cb",
                "ace5bff07bcfb85fd5e5354d028332a3e9c0d384b10547417097774a5bbb940f",
            ],
        }
    )

    # fixes dataframe similar to fix.csv
    fixes_df = pd.DataFrame(
        {
            "id": ["f1"],
            "transaction_id": [
                "row1",
            ],
            "date": [None],
            "description": ["Updated Description"],
            "info": [None],
            "amount": [7000],
            "class": [None],
            "category": [None],
            "sub_category": [None],
        }
    )

    # apply the fixes
    fixed_df = apply_fixes(df, fixes_df)

    # assert that the fixes are applied correctly
    assert fixed_df.loc[0, "description"] == "Updated Description"
    assert fixed_df.loc[0, "amount"] == 7000.00

    # assert that other records remain unchanged
    for i in range(2, len(fixed_df)):
        assert fixed_df.loc[i, "description"] == "Arbor Realty Trust"
        assert fixed_df.loc[i, "amount"] == df.loc[i, "amount"]


def test_apply_fixes_with_failed_fixes():
    # input dataframe similar to 6_add_id.csv
    df = pd.DataFrame(
        {
            "date": [
                "2023-05-31",
                "2023-11-30",
                "2023-09-30",
                "2024-02-28",
                "2023-07-31",
                "2023-01-31",
                "2023-02-27",
                "2024-01-31",
                "2023-08-31",
                "2023-10-31",
            ],
            "account": ["nordnet_salkkuraportti"] * 10,
            "description": ["Arbor Realty Trust"] * 10,
            "info": ["Salkku 1"] * 10,
            "amount_original": [
                7080.47,
                6879.18,
                8614.75,
                8239.58,
                9227.57,
                8239.58,
                8552.46,
                8239.58,
                8830.95,
                7155.15,
            ],
            "class": ["varat"] * 10,
            "category": ["sijoitusvarallisuus"] * 10,
            "sub_category": ["osinkosalkku"] * 10,
            "rule_id": ["10"] * 10,
            "source_file": ["nordnet_salkkuraportti.csv"] * 10,
            "share": [1.0] * 10,
            "amount": [
                7080.47,
                6879.18,
                8614.75,
                8239.58,
                9227.57,
                8239.58,
                8552.46,
                8239.58,
                8830.95,
                7155.15,
            ],
            "owner": ["mkk"] * 10,
            "split": [False] * 10,
            "not_unique_id": [
                "row1",
                "2fc34542f6a4ee6c55c5fcf8815389e7d58f23a24b90c405f3a56bd2263fdc16",
                "08568b96583cd2e212060ff9d33d169d6693ab89b64cc6a483adc38bf18ce418",
                "830d11c0a38dd3e971a1fbbdc768518205a8fefef385fe2e08970232995a3c7d",
                "6e375004ef78fb7891401b62622acb081ae388bdc92b0ba19e717a3a29568b73",
                "c4802f31174dcba7b17ddf3716469524f97ad52a8b5470902f4bdb799891cef0",
                "6cf5b9368b27c61b8b9a664e9ec262e89892251a57614b4673c84c783a201509",
                "b05e9de38921da5b0356d38d61679818a26e8f9b81402b650e38cb6c0eb55a36",
                "12a18dd9a05a126bd1db199b50ebacf3ac06d811a01ef32bd1a874f7250a05cb",
                "ace5bff07bcfb85fd5e5354d028332a3e9c0d384b10547417097774a5bbb940f",
            ],
        }
    )

    # fixes dataframe with a non-existent transaction_id
    fixes_df = pd.DataFrame(
        {
            "id": ["f1", "f2"],
            "transaction_id": [
                "row1",
                "non_existent_row",
            ],
            "date": [None, None],
            "description": ["Updated Description", "Non-existent Description"],
            "info": [None, None],
            "amount": [7000, 8000],
            "class": [None, None],
            "category": [None, None],
            "sub_category": [None, None],
        }
    )

    # apply the fixes and expect a ValueError
    with pytest.raises(ValueError) as excinfo:
        apply_fixes(df, fixes_df)

    # assert that the error message contains the failed fix
    assert "1 fixes failed" in str(excinfo.value)


if __name__ == "__main__":
    pytest.main()
