# FiRe - Financial Independence, Retire Early

This is a personal finance tracking application made with Python and Power BI.

Instructions (in Finnish): [Oman Talouden Seuranta](https://mkkvkmn.com/oman-talouden-seuranta/)

## Table of Contents

- [Install](#install)
- [Tests](#tests)
- [Run in Terminal](#run-in-terminal)
- [Settings](#settings)
- [Important Notes](#important-notes)
  - [Classes (Luokat)](#classes-luokat)
  - [Categories](#categories)
  - [Sub-Categories](#sub-categories)
- [Power BI](#power-bi)
- [Contribution Guidelines](#contribution-guidelines)
- [License](#license)
- [Contact](#contact)

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

# Tests

```shell
pytest tests
```

# Run in Terminal

Run the application:

```shell
Python3 fire.py
```

Run the application in debug mode (gives more info and creates intermediate files for debugging)
Use -d or --debug:

```shell
Python3 fire.py --debug
```

```shell
run
```

# Settings

The application settings are configured in the settings.py file. Below is an explanation of each setting:

LOG_LEVEL: The logging level for the application. Default is logging.WARNING.
LOG_FILE: The path to the log file. Default is ../../logs/app.log.
PROJECT_ROOT: The root directory of the project.
DATA_FOLDER: The directory where data files are stored.
PREPROCESSORS_FOLDER: The directory where preprocessor files are stored.
CONFIG_FOLDER: The directory where configuration files are stored.

## SETTINGS Dictionary

default_owner: The default owner for transactions. Default is "mkk".
source_folder: The directory where source files are stored. Default is "data/source_files".
intermediate_folder: The directory where intermediate files are stored. Default is "data/intermediate".
final_result_file: The path to the final result file. Default is "data/final/final_data.csv".
files_file: The path to the files configuration file. Default is "config/source_file_reader/files.csv".
categories_file: The path to the categories configuration file. Default is "config/data_processing/categories.csv".
fixes_file: The path to the fixes configuration file. Default is "config/data_processing/fixes.csv".
splits_file: The path to the splits configuration file. Default is "config/data_processing/splits.csv".
use_targets: Whether to use targets. Default is True.
targets_file: The path to the targets configuration file. Default is "config/data_processing/targets.csv".
debug_folder: The directory where debug files are stored. Default is "data/intermediate/debug".
debug_mode: Whether to run the application in debug mode. Default is False.
use_nordnet_portfolio: Whether to process the Nordnet portfolio. Default is True.
nordnet_portfolio_file: The path to the Nordnet portfolio file. Default is "data/source_files/for_preprocessors/nordnet/salkkuraportti.csv".

# Important Notes

For the Power BI report to work, following classes, categories and subcategories should be used with categories.csv file.

These are referenced in the related Power BI file. Using something else means that the Power BI file requires changes too.

## Classes (Luokat)

Available: Tulot, Menot, Varat, Velat, Pois

Tulot - income
Menot - costs
Varat - assets
Velat - liabilities
Pois - anything you want to exclude

## Categories

Required (referenced in Power BI measures):

- Ansiotulot (salary)
- Pääomatulot (capital income)
- Sijoitusvarallisuus (investments)
- Sijoitusvelat (debts related to investments)
- add more as you wish

## Sub-Categories

Required (referenced in Power BI measures):

- Osinkotulot (dividends)
- add more as you wish

# Power BI

Included in source code.

![alt text](https://github.com/mkkvkmn/fire/blob/main/assets/fire.png?raw=true)

# Contribution Guidelines

We welcome contributions to this project! If you would like to contribute, please follow these guidelines:

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Make your changes and commit them with clear and concise messages.
4. Push your changes to your fork.
5. Create a pull request to the main repository.
