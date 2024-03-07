# FiRe - Financial independence, Retire early
This is a personal finance tracking thing made with python and Power BI.

Instructions (in Finnish): https://mkkvkmn.com/oman-talouden-seuranta/

# Install

- create venv: python -m venv venv
- activate: source venv/bin/activate
- pip install -r requirements.txt

# Run in Terminal
*Python3 fire.py* or *Python3 fire.py -v* (verbose, gives more info and creates intermediate files for debugging)

# Settings
![alt text](https://github.com/mkkvkmn/fire/blob/main/assets/glob.png?raw=true)

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
