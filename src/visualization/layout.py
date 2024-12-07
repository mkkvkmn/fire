# src/visualization/layout.py

from dash import dcc, html

layout = html.Div(
    [
        html.H1("Monthly Summary of Income and Costs"),
        dcc.Dropdown(
            id="class-dropdown",
            options=[
                {"label": "Income", "value": "tulot"},
                {"label": "Costs", "value": "menot"},
            ],
            value="tulot",
        ),
        dcc.Graph(id="bar-chart"),
    ]
)
