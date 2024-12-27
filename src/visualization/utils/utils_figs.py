import pandas as pd
import plotly.express as px


def create_bar_chart(data, x, y, color, title, desired_classes):
    # Filter the DataFrame to include only the desired classes
    data_filtered = data[data[color].isin(desired_classes)]

    # Create bar chart
    fig = px.bar(
        data_filtered,
        x=x,
        y=y,
        color=color,
        barmode="group",
        labels={x: "Period", y: "Amount", color: "Category"},
        title=title,
        template="plotly_dark",
    )

    # Update layout for dark background and white text
    fig.update_layout(
        yaxis_tickformat=",.2f",
        xaxis_title="Period",
        yaxis_title="Amount",
        legend_title="Category",
    )

    return fig
