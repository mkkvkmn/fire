import streamlit as st
import pandas as pd
import plotly.express as px

# Sample data
data = {
    "period": ["2021-01", "2021-02", "2021-03"],
    "income": [4000, 6000, 7000],
    "costs": [3000, 3500, 4000],
}

df = pd.DataFrame(data)

# Language options
languages = {
    "English": {"decimal": ".", "thousands": ",", "currency": "$"},
    "Finnish": {"decimal": ",", "thousands": " ", "currency": "€"},
}


def app():
    st.title("Income and Costs")

    # Language selector
    language = st.selectbox("Select Language", options=list(languages.keys()))

    # Get the selected language settings
    lang_settings = languages[language]

    # Create bar chart
    fig = px.bar(df, x="period", y=["income", "costs"], title="Income and Costs")

    # Update layout
    fig.update_layout(
        xaxis_title="Period",
        yaxis_title="Amount",
        barmode="group",
        template="plotly_white",
    )

    # Format y-axis labels
    fig.update_yaxes(tickformat=f",.0f".replace(",", lang_settings["thousands"]))

    # Format hover text
    fig.update_traces(
        hovertemplate=f"%{{x}}<br>%{{y:,.0f}}<extra></extra>".replace(
            ",", lang_settings["thousands"]
        )
    )

    # Display the chart
    st.plotly_chart(fig)
