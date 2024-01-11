import os
import re
import logging
import argparse
import ast
import hashlib

import pandas as pd
import chardet


GLOB = {
    "in_folder": "../fire_data/input",
    "out_folder": "../fire_data/output",
    "files_file": "../fire_data/config/files.csv",
    "categories_file": "../fire_data/config/categories.csv",
}


def create_id(row):
    row_str = ''.join(map(str, row.values))
    return hashlib.sha256(row_str.encode()).hexdigest()


def save_csv(df, target):
    logging.debug(f"Saving {df} to {target}")
    dir = os.path.dirname(target)

    if not os.path.exists(dir):
        os.makedirs(dir)

    df.to_csv(target, index=False, encoding='utf-8-sig')


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
            raise ValueError(f"No matching pattern found for file {file}")
    
    return file_info


def append_files(files):
    df_list = []

    for file_path, props in files.items():
        try:
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path, delimiter=props['delimiter'], dtype=str, encoding=props['encoding'])
            elif file_path.endswith('.xlsx'):
                df = pd.read_excel(file_path, dtype=str)
            else:
                raise ValueError(f"Unsupported file format for {file_path}")

            # convert string to dictionary and rename columns
            column_mapping = ast.literal_eval(props['columns'])
            df.rename(columns=column_mapping, inplace=True)

            # add and choose columns
            df['account'] = props['file_name']
            df = df[['date', 'account', 'description', 'info', 'amount',]]
            df['id'] = df.apply(create_id, axis=1)

            target = os.path.join(GLOB['out_folder'], 'append', 'before_types.csv')
            save_csv(df,target) # use this to see date formats

            # convert types
            df['amount'] = df['amount'].str.replace('\xa0', '').str.replace(',', '.').str.replace('−','-').astype(float)
            df['date'] = pd.to_datetime(df['date'], format=props['date_format'], dayfirst=props['day_first'])
            df['info'] = df['info'].fillna('')

            target = os.path.join(GLOB['out_folder'], 'append', 'after_types.csv')
            save_csv(df,target)

            df_list.append(df)

        except Exception as e:
            raise ValueError(f"Error processing file {file_path}: {e}")
        
    df_all = pd.concat(df_list, ignore_index=True)

    return df_all


def match_rule(row, rule):
    # Function to check if a row matches a given rule
    account_match = re.search(rule['account'], row['account'], re.IGNORECASE) if rule['account'] != '.*' else True
    description_match = re.search(rule['description'], row['description'], re.IGNORECASE) if rule['description'] != '.*' else True
    info_match = re.search(rule['info'], row['info'], re.IGNORECASE) if rule['info'] != '.*' else True
    amount_match = float(row['amount']) > 0 if rule['amount'] == 'pos' else (float(row['amount']) < 0 if rule['amount'] == 'neg' else True)

    return account_match and description_match and info_match and amount_match

def categorize_data(df, rules_df):

    for column in ['rule_id', 'class', 'category', 'sub_category']:
        if column not in df.columns:
            df[column] = pd.NA

    for _, rule in rules_df.iterrows():
        # Apply the rule to each row
        for index, row in df.iterrows():
            if match_rule(row, rule):
                df.at[index, 'rule_id'] = rule['id']
                df.at[index, 'class'] = rule['class']
                df.at[index, 'category'] = rule['category']
                df.at[index, 'sub_category'] = rule['sub_category']

    df = df[['id', 'date', 'account', 'description', 'info', 'amount', 'class' ,'category' ,'sub_category','rule_id']]

    return df


def find_uncategorized(df):
    return df[df['rule_id'].isna()]


def print_uncategorized_rows(df, limit=20):
    print(df[['date','account','description','info','amount']].head(limit).to_string(index=False))
    # print(uncategorized_df.head(limit))


def main():

    parser = argparse.ArgumentParser()
    parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose logging')
    args = parser.parse_args()

    # logging
    if args.verbose:
        logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
    else:
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    # collect
    try:
        logging.debug("Collect files")
        files = collect_files(GLOB['in_folder'], GLOB['files_file'])
        logging.info(f"Found: {len(files)} files")
    except ValueError as e:
        logging.error(e)

    # append
    try:
        df_all = append_files(files)
    except ValueError as e:
        logging.error(e)


    # categorize
    categories = pd.read_csv(GLOB['categories_file'])
    df_categorized = categorize_data(df_all, categories)
    print(df_categorized.columns)

    while True:

        df_categorized = categorize_data(df_categorized, categories)
        uncategorized_df = find_uncategorized(df_categorized)
        
        if uncategorized_df.empty:
            print("All data has been categorized!")
            break
        else:
            print_uncategorized_rows(uncategorized_df)
            input("Update the rules and press enter to re-categorize... ")
            categories = pd.read_csv(GLOB['categories_file'])  # Reload rules in case they have been updated

    target = os.path.join(GLOB['out_folder'], 'categories', 'categorized.csv')
    save_csv(df_categorized,target)

if __name__ == '__main__':
    main()
