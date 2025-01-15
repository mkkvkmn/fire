# FiRe - Data Pipeline

## Migrations

If you have have used v1, please see the [Migration from v1 to v2 Guide](src/data_processing/migration_scripts/readme.md) for instructions on automatically or manually migrating your data.

! important: Version 2.0 will recalculate id fields for your data. This will break `fixes.csv` and you need to manually find the new id for each fix.

## How Does it Work?

1. First run after migrating v1 to v2: files.csv is converted to .yml files (if you haven't used v1, forget this)
2. Source files are read using .yml config files. Config files define date format and used columns etc.
3. All source file data is loaded into an appended data frame.
4. Data records are categorized using config file categories.csv.
5. Data records are splitted between owners using config file splits.csv
6. An id is added for each row, it's not unique but can be used for fixes
7. Data record fixed are applied using config file fixes.csv
8. Target data records are added if USE_TARGETS = True
9. Data categorization and id changes are logged - these need to be approved when running the pipeline. Useful for not making errors.
10. Data duplicates are validated - are they purposeful or mistakes? Again you need to approve them.
11. [Final data](../data/final/final_data.csv) can be analyzed with [Power BI](../x_stuff/pbi)

## Run Tests in Terminal

Run in project root directory (fire):

```shell
pytest data_pipeline/tests
```

## Run Data Pipeline in Terminal

Run the application from project root directory (fire):

```shell
Python3 fire.py
```

Run the application in debug mode (gives more info and creates intermediate files for debugging)
Use -d or --debug:

```shell
Python3 fire.py --debug
```
