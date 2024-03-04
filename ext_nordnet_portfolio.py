import re
import logging

import pandas as pd
import numpy as np
import chardet


def detect_encoding(file_path):
    with open(file_path, 'rb') as f:
        rawdata = f.read()

    result = chardet.detect(rawdata)

    return result['encoding']


def process_portfolio(src_file_path):
    logging.info(f"..Start: Portfolio extension")

    # Set file and encoding
    file_path = src_file_path
    encodingtype = detect_encoding(file_path)

    # Define a pattern to match rows with a currency amount
    account_pattern = 'aot'
    cash_pattern = 'likvidit varat'
    date_pattern = r'(\d{1,2}\.\d{1,2}\.\d{4})' # dd.mm.yyyy
    currency_pattern = r'^\d+,\d+\s+[A-Z]{3}$'
    """
    ^ - matches the start of the string
    \d+ - matches one or more digits
    , - matches comma
    \s+ - matches one or more whitespace characters
    [A-Z]{3} - matches three uppercase letters (currency code)
    $ - matches the end of the string

    """

    # Read in the CSV file
    df = pd.read_csv(file_path, header=None, names=['transaction'], encoding=encodingtype)
    logging.info(f"..Read file: {file_path}")

    # add account and fill
    df['account'] = ''
    df.loc[df['transaction'].str.contains(account_pattern, flags=re.IGNORECASE), 'account'] = 'account'

    # add label and set starting points
    df['label'] = ''
    df.loc[df['transaction'].str.contains(currency_pattern, flags=re.IGNORECASE), 'label'] = 'price'
    df.loc[df['transaction'].str.contains(cash_pattern, flags=re.IGNORECASE), 'label'] = 'cash'

    # add date and fill
    df['date'] = ''
    df['date'] = df['transaction'].str.extract(date_pattern).ffill()

    # Find the positions of the "price" and "cash" labels
    account_label_locations = df.index[df['account'] == 'account']
    price_label_locations = df.index[df['label'] == 'price']
    cash_label_locations = df.index[df['label'] == 'cash']

    # Use account positions to assign the new labels to the corresponding rows
    for i, idx in enumerate(account_label_locations):
        df.at[idx+1, 'account'] = df.at[idx+1, 'transaction']
        df.at[idx, 'account'] = ''

    # Use price positions to assign the new labels to the corresponding rows
    for i, idx in enumerate(price_label_locations):
        df.at[idx-1, 'label'] = 'stock'
        df.at[idx+1, 'label'] = 'purchase_price'
        df.at[idx+2, 'label'] = 'qty'
        df.at[idx+3, 'label'] = 'market_value'
        df.at[idx+4, 'label'] = 'change'
        df.at[idx+5, 'label'] = 'share'

    # Use cash positions to assign the new labels to the corresponding rows
    for i, idx in enumerate(cash_label_locations):
        df.at[idx+1, 'label'] = 'market_value'
        df.at[idx+2, 'label'] = 'share'
        df.at[idx, 'label'] = 'stock'

    # fill accounts
    df['account'].replace('', np.nan, inplace=True)
    df['account'] = df['account'].ffill()

    logging.info(f"..Labels done")


    # Add stock column
    df['stock'] = pd.Series(np.where(df['label'] == 'stock', df['transaction'], None)).ffill()

    # Filter out rows with empty labels
    df = df[df['label'] != '']

    # Filter out stock lables (already a column)
    df = df[df['label'] != 'stock']

    # Pivot the data so that labels and index are column headers
    pivoted_df = df.pivot(index=['date','account','stock'], columns='label', values='transaction').reset_index()

    # Split the "Price" column into "Price" and "Currency" columns
    pivoted_df[['price', 'currency']] = pivoted_df['price'].str.split(' ', n=1, expand=True)

    logging.info(f"..Done: Portfolio preprocess")

    return pivoted_df