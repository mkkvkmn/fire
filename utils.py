import logging
import os

import chardet
import pandas as pd
import numpy as np

from settings import GLOB

def detect_encoding(file_path):
    with open(file_path, 'rb') as f:
        rawdata = f.read()

    result = chardet.detect(rawdata)

    return result['encoding']


def print_df(df, exclude_cols_list=None):
    pd.set_option('display.max_colwidth', 20)
    if exclude_cols_list is not None:
        df = df.drop(columns=exclude_cols_list)
    print(df)


def save_on_debug(df, file_name, append=False):
    folder = GLOB['debug_folder']
    file_path = os.path.join(folder, file_name)
    if GLOB['debug']:
        if not os.path.exists(folder):
            os.makedirs(folder)

        # append if append=True
        mode = 'a' if append and os.path.exists(file_path) else 'w'
        header = True if mode == 'w' else False

        df.to_csv(file_path, mode=mode, index=False, header=header, encoding='utf-8-sig')
        action = "Added rows to: " if append else "Saved: "
        logging.info(f"{action} {file_path}")


def has_content(value):
    if isinstance(value, (int, float)):
        return not pd.isna(value)
    return value not in [None, '', np.nan]
