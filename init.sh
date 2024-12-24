#!/bin/bash

# Define the directories where __init__.py files are needed
directories=(
    "src"
    "src/visualization"
    "src/visualization/callbacks"
    "src/visualization/layouts"
    "config"
    "tests"
)

# Loop through each directory and create __init__.py if it doesn't exist
for dir in "${directories[@]}"; do
    init_file="$dir/__init__.py"
    if [ ! -f "$init_file" ]; then
        touch "$init_file"
        echo "Created $init_file"
    else
        echo "$init_file already exists"
    fi
done

echo "All necessary __init__.py files have been created."