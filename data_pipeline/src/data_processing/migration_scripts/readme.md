# Migration from v1 to v2

This Readme explains how to use the `migrate_from_v1_to_v2.py` script to migrate your existing data to the new format.

It also provides manual steps for migration if the script fails.

! important: Version 2.0 will recalculate id fields for your data. This will break `fixes.csv` and you need to manually find the new id for each fix.

---

# How to Run the Script

1. Open your terminal or command prompt
2. Navigate to `migrate_from_v1_to_v2.py` location (fire/data_pipeline/src/data_processing/migration_scripts).
3. Run the script with the following command

Please note that the migration happens from v1 **data** folder to a new base dir. After migration the new base dir will contain data and config folders.

```shell
python migrate_from_v1_to_v2.py v1_data_dir v2_base_dir
```

Replace `v1_data_dir` with the path to your old data directory and `v2_base_dir` with the path to the new base directory.

Example:

```shell
python python migrate_from_v1_to_v2.py /mnt/c/a/repos/m/fire-v1/data/ /mnt/c/a/repos/m/fire-v2/
```

---

# How to Migrate Manually

1. Backup your current data folder containing the config folder and files
2. Copy from repository the folders config and data to your preferred location
3. Delete all the files except `__init__.py` and `nordnet_salkkuraportti_preprocessed.csv.yml`.
4. Move your current files to the new structure except `nnsr.csv`
5. Rename some of the files (details below)

Old (v1) -> New (v2):

- `data/config/files.csv` -> `config/source_file_reader/files.csv`

- `data/config/categories.csv` -> `config/data_processing/categories.csv`
- `data/config/fix.csv` -> `config/data_processing/fixes.csv` (! rename)
- `data/config/splits.csv` -> `config/data_processing/splits.csv`

- `data/extensions/nordnet/salkkuraportti.csv` -> `data/source_files/for_preprocessors/nordnet/nordnet_salkkuraportti.csv` (! rename)
- `data/input/<all source files>` -> `data/source_files/<all source files>`

After moving the files, you should have separate folders for config and data containing all of your files in the folders:

```
config
├── **init**.py
├── data_processing
│   ├── categories.csv
│   ├── fixes.csv
│   ├── splits.csv
│   └── targets.csv (optional)
└── source_file_reader
    └── files.csv
data
└── source_files
├── for_preprocessors
│   └── nordnet
│   └── nordnet_salkkuraportti.csv
├── <source_file_1.csv>
└── <source_file_2.csv>
```

To use your new data, see [.env](../../../../#env) file.

# Important

Version 2.0 will recalculate id fields for your data. This will break `fixes.csv` and you need to manually find the new id for each fix.
