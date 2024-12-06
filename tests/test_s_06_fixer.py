import sys
import os

# add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

import pytest
import pandas as pd
from data_processing.s_06_fixer import apply_fixes


def test_apply_fixes():
    # input dataframe similar to 3_splitted.csv
    df = pd.DataFrame(
        {
            "transaction_id": [
                "74d8e4624d8525c5f37c79c5a2968b6974e891f49db394c107eec4f4f24035de",
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
            "amount_orig": [
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
            "transaction_row_id": [
                "row_1",
                "row_2",
                "row_3",
                "row_4",
                "row_5",
                "row_6",
                "row_7",
                "row_8",
                "row_9",
                "row_10",
            ],
        }
    )

    # fixes dataframe similar to fix.csv
    fixes_df = pd.DataFrame(
        {
            "id": ["f1", "f2"],
            "transaction_id": [
                "74d8e4624d8525c5f37c79c5a2968b6974e891f49db394c107eec4f4f24035de",
                "row_2",
            ],
            "date": [None, None],
            "description": ["Updated Description", None],
            "info": [None, None],
            "amount": [None, 7000.00],
            "class": [None, None],
            "category": [None, None],
            "sub_category": [None, None],
        }
    )

    # apply the fixes
    fixed_df = apply_fixes(df, fixes_df)

    # assert that the fixes are applied correctly
    assert fixed_df.loc[0, "description"] == "Updated Description"
    assert fixed_df.loc[1, "amount"] == 7000.00

    # assert that these remain unchanged
    assert fixed_df.loc[0, "amount"] == 7080.47
    assert fixed_df.loc[1, "description"] == "Arbor Realty Trust"

    # assert that other records remain unchanged
    for i in range(2, len(fixed_df)):
        assert fixed_df.loc[i, "description"] == "Arbor Realty Trust"
        assert fixed_df.loc[i, "amount"] == df.loc[i, "amount"]


if __name__ == "__main__":
    pytest.main()
