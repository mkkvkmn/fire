import streamlit as st
import pandas as pd
import plotly.express as px


def app():
    st.title("Assets and Investments")

    # Sample data
    data = {
        "period": ["2021-01", "2021-02", "2021-03"],
        "assets": [15000, 16000, 17000],
        "investments": [8000, 8500, 9000],
    }

    df = pd.DataFrame(data)

    # Create bar chart
    fig = px.bar(
        df, x="period", y=["assets", "investments"], title="Assets and Investments"
    )

    # Update layout
    fig.update_layout(
        xaxis_title="Period",
        yaxis_title="Amount",
        barmode="group",
        template="plotly_white",
    )

    # Display the chart
    st.plotly_chart(fig)
