# FiRe - Financial Independence, Retire Early

This is a personal finance tracking application made with Python and Power BI.

It eats .csv and .xlsx files and outputs reports.

## What You Get

- Overall understanding of you finances as a Power BI report
  - Income, costs, assets & liabilities, dividend income, fire estimate
- Ability to set and track targets
- Multiperson household support

## Migrations

If you have have used v1, please see the [Migration from v1 to v2 Guide](data_pipeline/src/data_processing/migration_scripts/readme.md) for instructions on automatically or manually migrating your data.

! important: Version 2.0 will recalculate id fields for your data. This will break `fixes.csv` and you need to manually find the new id for each fix.

## Install

1. create virtual environment:

```shell
python -m venv venv
```

2. activate:

macOS/Linux:

```shell
source venv/bin/activate
```

Windows:

```shell
venv\Scripts\activate
```

3. install dependencies

```shell
pip install -r requirements.txt
```

## Config

### Settings

The application settings are configured in the [settings.py](config/settings.py) file.

You can overwrite some settings with environment variables. Add .env file to repository root.

Example .env file contents:

DATA_FOLDER = "../my_data/data"
CONFIG_FOLDER = "../my_data/config"
DEFAULT_OWNER = "mkk"
USE_TARGETS = True
USE_NORDNET_PORTFOLIO = True
LOG_FILE="./logs/logs.log"

### Source File Reader

We need to tell the data pipeline how each source file is read. To do this the data_pipeline uses .yml files.

If you have a files.csv from V1, it will be converted into .yml files when you run the data_pipeline for the first time. Files.csv is depracated in v 2.0.

Let's say you have a source file called credit_card_transactions.csv, an example .yml looks like this:

"id": "11"
"pattern": "credit_card"
"account": "credit_card_visa"
"delimiter": ","
"date_format": "%Y-%m-%d %H:%M:%S"
"day_first": "FALSE"
"columns":
"date": "TransactionDate"
"amount": "Amount"
"description": "Text"
"info": "Merchant Category"

.yml files are not defined for each file but for each pattern. Meaning you can use the example .yml file from above to read

credit_card_1.csv
credit_card_2.csv
etc.

### Data Processing

Data processing happens using config files.

- categories.csv -> assign class, category and sub_category for you data
- fixes.csv -> overwrite assigned category, useful forexample if you buy a tv from the store where by default you get groceries
- splits.csv -> you can split data by owner, useful for multiperson households
- targets.csv -> set monthly targets for income or costs class / category / sub_category

## Data Pipeline

[Data pipeline documentation and user guide](data_pipeline/readme.md)

## Logic Backend

Coming someday...

## UI

Coming someday...

For now, just use the Power BI file included (only Finnish for now, sorry).

## Power BI

[Power BI](x_stuff/pbi/) is included in source code.

# Contribution Guidelines

We welcome contributions to this project! If you would like to contribute, please follow these guidelines:

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Make your changes and commit them with clear and concise messages.
4. Push your changes to your fork.
5. Create a pull request to the main repository.
