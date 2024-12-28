import streamlit as st
from multiapp import MultiApp
from pages import overview, income_costs, assets_investments

app = MultiApp()

# Add all your application pages here
app.add_app("Overview", overview.app)
app.add_app("Income and Costs", income_costs.app)
app.add_app("Assets and Investments", assets_investments.app)

# The main app
app.run()
