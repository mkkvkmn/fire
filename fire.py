import os
import re
import logging
import argparse
import ast
import hashlib
import sys
import datetime
import time

import pandas as pd
import chardet
from tqdm import tqdm

from ext_nordnet_portfolio import process_portfolio

FILES_FOLDER = "./data/"
# FILES_FOLDER = "../fire_data/"

GLOB = {
    "in_folder": FILES_FOLDER + "input",
    "out_folder": FILES_FOLDER + "output",
    "files_file": FILES_FOLDER + "config/files.csv",
    "categories_file": FILES_FOLDER + "config/categories.csv",
    "fixes_file": FILES_FOLDER + "config/fix.csv",
    "splits_file": FILES_FOLDER + "config/splits.csv",
    "default_owner": "mkk",
    "debug": False,
    "debug_folder": FILES_FOLDER + "output/debug",
    "data_file": FILES_FOLDER + "output/data.csv",
    "ext_nordnet_portfolio": True, #True / False
    "ext_nordnet_portfolio_file": FILES_FOLDER + "extensions/nordnet/salkkuraportti.csv",
    "ext_nordnet_portfolio_filename_done": "nnsr.csv",
}


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


def print_df(df, exclude_cols_list=None):
    pd.set_option('display.max_colwidth', 20)
    if exclude_cols_list is not None:
        df = df.drop(columns=exclude_cols_list)
    print(df)


def create_id(row):
    row_str = ''.join(map(str, row.values))
    return hashlib.sha256(row_str.encode()).hexdigest()


def detect_encoding(file_path):
    with open(file_path, 'rb') as f:
        rawdata = f.read()

    result = chardet.detect(rawdata)

    return result['encoding']


def collect_files(input_folder, config_file):

    df_file_props = pd.read_csv(config_file)
    file_info = {}

    for file in os.listdir(input_folder):
        file_path = os.path.join(input_folder, file)
        
        # match file against patterns in the config
        matched = False
        for _, row in df_file_props.iterrows():
            if re.match(row['pattern'], file):

                if pd.isna(row['id']):
                    raise ValueError(f"Missing properties for file {file}")
                
                file_info[file_path] = {
                    'file_name': file,
                    'account': row['account'],
                    'encoding': detect_encoding(file_path),
                    'file_path': file_path,
                    'pattern': f"id: {row['id']} ({row['pattern']})",
                    'delimiter': row['delimiter'],
                    'date_format': row['date_format'],
                    'day_first': row['day_first'],
                    'columns': row['columns']
                }
                matched = True
                break

        if not matched:
            raise ValueError(f"No matching pattern found for file {file}. Add it to 'files.csv'")
    
    logging.info(f"Found: {len(file_info)} files")
    return file_info


def append_files(files):
    df_list = []

    for file_path, props in files.items():
        try:
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path, delimiter=props['delimiter'], dtype=str, encoding=props['encoding'], engine='python')
            elif file_path.endswith('.xlsx'):
                df = pd.read_excel(file_path, dtype=str)
            else:
                logging.error(f"Unsupported file format for {file_path}")
                sys.exit(1)

            # convert string to dictionary and rename columns
            column_mapping = ast.literal_eval(props['columns'])
            df.rename(columns=column_mapping, inplace=True)

            # choose cols to keep and add some
            if 'account' not in df.columns:
                df['account'] = props['account'] # only create if not in data
            df = df[['date', 'account', 'description', 'info', 'amount',]]
            df['source_file'] = props['file_name']
            df['transaction_id'] = df.apply(create_id, axis=1)

            save_on_debug(df,'1_append_before_types.csv',True) # use this to see date formats

            # convert types
            df['amount'] = df['amount'].str.replace('\xa0', '').str.replace(',', '.').str.replace('−','-').astype(float)
            df['date'] = pd.to_datetime(df['date'], format=props['date_format'], dayfirst=props['day_first'])
            df['info'] = df['info'].fillna('')

            save_on_debug(df,'2_append_after_types.csv',True)

            df_list.append(df)

        except KeyError as e:
            logging.error(f"Append - KeyError in file {GLOB['file_path']}: {e}")
            sys.exit(1)
        except Exception as e:
            logging.error(f"Append - Error processing file {file_path}: {e}")
            sys.exit(1)
        
    df_all = pd.concat(df_list, ignore_index=True)
    df_all = df_all.dropna(subset=['date', 'description'], how='all')

    logging.info(f"Appended: {len(df_list)} files")

    return df_all


def validate_categories(df):
    if df['id'].isnull().any():
        raise ValueError(f"Empty 'id' value found. Please add id to each row in {GLOB['categories_file']}")

    cols_to_replace = df.columns.drop('id')
    df[cols_to_replace] = df[cols_to_replace].applymap(lambda x: '.*' if pd.isnull(x) or x in ['','*'] else x)

    return df 


def categorize_data(df, rules_df):
    # add new columns for categorization if they don't exist
    for column in ['rule_id', 'class', 'category', 'sub_category']:
        if column not in df.columns:
            df[column] = pd.NA

    # apply rules
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    message = f"{current_time} - INFO - Categorize "
    for _, rule in tqdm(rules_df.iterrows(), total=rules_df.shape[0], desc=message, bar_format="{l_bar}{bar:10}{r_bar}{bar:-10b}"):
        try:
            # create a mask for the current rule
            account_mask = df['account'].str.contains(rule['account'], case=False, na=False, regex=True) if rule['account'] != '.*' else True
            description_mask = df['description'].str.contains(rule['description'], case=False, na=False, regex=True) if rule['description'] != '.*' else True
            info_mask = df['info'].str.contains(rule['info'], case=False, na=False, regex=True) if rule['info'] != '.*' else True
            amount_mask = (
                df['amount'].astype(float) > 0 if rule['amount'] == 'pos' else (
                    df['amount'].astype(float) < 0 if rule['amount'] == 'neg' else (
                        df['amount'].astype(float) == 0 if rule['amount'] == 'zero' else True
                    )
                )
            )
        except TypeError as e:
            logging.error(f"Categorize - TypeError in file {GLOB['fixes_file']}: {e}")
            logging.error(f"No empty cells allowed in {GLOB['categories_file']} rule id: {rule['id']}")
            sys.exit(1)

        total_mask = account_mask & description_mask & info_mask & amount_mask

        # categorize
        df.loc[total_mask, 'rule_id'] = rule['id']
        df.loc[total_mask, 'class'] = rule['class']
        df.loc[total_mask, 'category'] = rule['category']
        df.loc[total_mask, 'sub_category'] = rule['sub_category']

    df = df[['transaction_id', 'date', 'account', 'description', 'info', 'amount', 'class', 'category', 'sub_category', 'rule_id', 'source_file']]

    return df


def categorize_data_loop(df,categories):
    while True:

        categories_validated = validate_categories(categories)
        df = categorize_data(df, categories_validated).sort_values(by='description')
        uncategorized_df = df[df['rule_id'].isna()]
        
        if uncategorized_df.empty:
            logging.info(f"Categorize done")
            return df
        else:
            print("\nCategories not found for:")
            print(uncategorized_df[['date','account','description','info','amount']].head(25).to_string(index=False))
            remaining = uncategorized_df.shape[0]
            input(f"\nToDo: {remaining} rows, Update categories.csv and press enter to re-categorize... \n\n")
            categories = pd.read_csv(GLOB['categories_file'])  # reload rules in case they have been updated


def apply_fixes(df, fix_file_path):
    df_fixes = pd.read_csv(fix_file_path)
    
    for index, fix in df_fixes.iterrows():
        try:
            data_index = df[df['transaction_id'] == fix['transaction_id']].index

            if not data_index.empty:
                df.at[data_index[0], 'rule_id'] = fix['id']
                df.at[data_index[0], 'class'] = fix['class']
                df.at[data_index[0], 'category'] = fix['category']
                df.at[data_index[0], 'sub_category'] = fix['sub_category']
        except KeyError as e:
            logging.error(f"Fix - KeyError in file {GLOB['fixes_file']}: {e}")
            sys.exit(1)
    
    logging.info(f"Applied fixes")

    return df


def do_splits(df, splits_file_path):
    splits_df = pd.read_csv(splits_file_path, parse_dates=['start', 'end'])
    splits_df = splits_df.dropna(subset=['start'], how='all') #remove empty rows
    
    # ensure data types
    splits_df['share'] = pd.to_numeric(splits_df['share'])
    splits_df['start'] = pd.to_datetime(splits_df['start'])
    splits_df['end'] = pd.to_datetime(splits_df['end'])

    # add split columns
    df = df.rename(columns={'amount': 'amount_orig'})
    df['share'] = 1
    df['amount'] = df['amount_orig']
    df['owner'] = GLOB['default_owner']
    df['split'] = False

    split_dfs = []

    for _, split in splits_df.iterrows():
        mask = (
            (df['account'] == split['account']) &
            (df['date'] >= split['start']) &
            (df['date'] <= split['end'])
        )

        temp_df = df[mask].copy()

        try:
            temp_df['amount'] = temp_df['amount_orig'] * split['share']
            temp_df['share'] = split['share']
            temp_df['owner'] = split['owner']
        except TypeError as e:
            logging.error(f"Split - TypeError row: {split}: {e}")
            sys.exit(1)

        split_dfs.append(temp_df)

        # mark the original rows as split to exclude them later
        df.loc[mask, 'split'] = True

    original_df = df[~df.get('split', False)]
    result_df = pd.concat([original_df] + split_dfs, ignore_index=True)

    logging.info(f"Did splits")
    return result_df


def main():
    start_time = time.time()
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    print(f"{current_time} - INFO - START")

    parser = argparse.ArgumentParser()
    parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose logging')
    args = parser.parse_args()

    # logging
    if args.verbose:
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
        GLOB['debug'] = True
    else:
        logging.basicConfig(level=logging.WARNING, format='%(asctime)s - %(levelname)s - %(message)s')

    # run nordnet portfolio extension
    if GLOB['ext_nordnet_portfolio']:
        source_file = GLOB['ext_nordnet_portfolio_file']
        target_filename = GLOB['ext_nordnet_portfolio_filename_done']
        target_file = os.path.join(GLOB['in_folder'], target_filename)
        df_portfolio = process_portfolio(source_file)
        df_portfolio.to_csv(target_file, encoding='utf-8-sig')
        logging.info(f"Portfolio saved: {target_file}")

    # collect
    files = collect_files(GLOB['in_folder'], GLOB['files_file'])

    # append
    df_appended = append_files(files)

    # categorize
    categories = pd.read_csv(GLOB['categories_file'])
    df_categorized = categorize_data_loop(df_appended,categories)
    save_on_debug(df_categorized,'3_categorized.csv')

    # apply fixes
    df_fixed = apply_fixes(df_categorized, GLOB['fixes_file'])
    save_on_debug(df_fixed,'4_fixed.csv')

    # split by owner
    df_splits = do_splits(df_fixed, GLOB['splits_file'])
    save_on_debug(df_splits,'5_splitted.csv')

    # done
    done_file = GLOB['data_file']
    df_splits.to_csv(done_file, encoding='utf-8-sig')
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    print(f"{current_time} - INFO - Saved {done_file}")

    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    elapsed_time = time.time() - start_time
    print(f"{current_time} - INFO - DONE ({elapsed_time:.2f} s)")

if __name__ == '__main__':
    main()
