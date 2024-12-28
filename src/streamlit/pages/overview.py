# filepath: /src/streamlit/pages/overview.py
import streamlit as st
import pandas as pd
import plotly.express as px


def app():
    st.title("Overview")

    # Date selector
    date_range = st.date_input("Select date range", [])

    # Sample data for KPI charts
    data = {
        "period": ["2021-01", "2021-02", "2021-03"],
        "income": [5000, 6000, 7000],
        "costs": [3000, 3500, 4000],
        "savings": [2000, 2500, 3000],
        "savings_pct": [40, 41.67, 42.86],
    }

    df = pd.DataFrame(data)

    # KPI charts
    st.metric(label="Total Income", value=f"${df['income'].sum():,.2f}")
    st.metric(label="Total Costs", value=f"${df['costs'].sum():,.2f}")
    st.metric(label="Total Savings", value=f"${df['savings'].sum():,.2f}")
    st.metric(label="Savings Percentage", value=f"{df['savings_pct'].mean():.2f}%")
