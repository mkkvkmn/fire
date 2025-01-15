# FiRe - Config

## Settings

The application settings are configured in the [settings.py](./settings.py) file.

You should use your own data and config files from outside the repository with the help of an .env file.

### .env

You can overwrite settings in settings.py with environment variables.

- Add .env file to project root (fire)
- Use your own data and config folder

Example .env file contents:

```
DATA_FOLDER = "../my_data/data"
CONFIG_FOLDER = "../my_data/config"
DEFAULT_OWNER = "mkk"
USE_TARGETS = True
USE_NORDNET_PORTFOLIO = True
LOG_FILE="./logs/logs.log"
```

## Source File Reader

In [config/source_file_reader](./source_file_reader/) we tell the data pipeline how each source file is read using .yml files.

If you have a files.csv from V1, it will be converted into .yml files when you run the data_pipeline for the first time. Files.csv is depracated in v 2.0.

Let's say you have a source file called credit_card_transactions.csv, an example .yml looks like this:

```
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
```

.yml files are not defined for each file but for each pattern. Meaning you can use the example .yml file from above to read

credit_card_1.csv\
credit_card_2.csv\
etc.

## Data Processing

Data processing is done using config files.

- categories.csv -> assign class, category and sub_category for you data
- fixes.csv -> overwrite assigned category, useful forexample if you buy a tv from the store where by default you get groceries
- splits.csv -> you can split data by owner, useful for multiperson households
- targets.csv -> set monthly targets for income or costs class / category / sub_category

## Important Notes for Power BI

For the Power BI report to work, following classes, categories and subcategories should be used within categories.csv file.

These are referenced in the related Power BI file. Using something else means that the Power BI file requires changes too.

### Classes (Luokat)

Available: Tulot, Menot, Varat, Velat, Pois

- Tulot - income
- Menot - costs
- Varat - assets
- Velat - liabilities
- Pois - anything you want to exclude

### Categories

Required (referenced in Power BI measures):

- Ansiotulot (salary)
- Pääomatulot (capital income)
- Sijoitusvarallisuus (investments)
- Sijoitusvelat (debts related to investments)
- add more as you wish

### Sub-Categories

Required (referenced in Power BI measures):

- Osinkotulot (dividends)
- add more as you wish
