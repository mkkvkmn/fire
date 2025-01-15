# FiRe - Financial Independence, Retire Early

This is a personal finance tracking application made with Python and Power BI.

It eats .csv and .xlsx files and outputs reports.

## What You Get

- Overall understanding of you finances as a Power BI report
  - Income, costs, assets & liabilities, dividend income, fire estimate
- Ability to set and track targets
- Multiperson household support

## Quick Guide

1. Grab the [Power BI file](x_stuff/pbi/) and see if you like the contents
2. [Install](#install) environment
3. [Run datapipeline](./data_pipeline/)
4. Use you own data ([config](./config/))
5. Run datapipeline
6. Update Power BI

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

Try running the data pipeline first. Then check how to use your own data from [config](./config/).

## Data Pipeline

[Data pipeline documentation and user guide](./data_pipeline/)

## Logic Backend

Coming someday...

## UI & Power BI

Custom UI coming someday...

For now, just use the Power BI [file](x_stuff/pbi/) included (only Finnish for now, sorry).

# Contribution Guidelines

We welcome contributions to this project! If you would like to contribute, please follow these guidelines:

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Make your changes and commit them with clear and concise messages.
4. Push your changes to your fork.
5. Create a pull request to the main repository.
