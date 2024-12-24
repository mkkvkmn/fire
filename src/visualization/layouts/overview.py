from dash import dcc, html
import dash_bootstrap_components as dbc
from config.settings import SETTINGS
from config.translations import translations


def get_overview_layout():
    """
    returns the layout for the overview tab, including kpi cards and a bar chart.
    """
    lang = SETTINGS["language"]
    income_label = translations[lang]["income"]
    costs_label = translations[lang]["costs"]
    total_income_label = translations[lang]["total_income"]
    total_costs_label = translations[lang]["total_costs"]
    savings_label = translations[lang]["savings"]
    savings_pct_label = translations[lang]["savings_pct"]
    overview_label = translations[lang]["overview"]

    return html.Div(
        [
            html.H2(overview_label),
            # placeholder for kpi cards
            html.Div(
                [
                    dbc.Card(
                        [
                            dbc.CardHeader(income_label, className="text-white"),
                            dbc.CardBody(
                                [
                                    html.H4(id="kpi-income", className="card-title"),
                                    html.P(total_income_label, className="card-text"),
                                ]
                            ),
                        ],
                        className="kpi-card",
                    ),
                    dbc.Card(
                        [
                            dbc.CardHeader(costs_label, className="text-white"),
                            dbc.CardBody(
                                [
                                    html.H4(id="kpi-costs", className="card-title"),
                                    html.P(total_costs_label, className="card-text"),
                                ]
                            ),
                        ],
                        className="kpi-card",
                    ),
                    dbc.Card(
                        [
                            dbc.CardHeader(savings_label, className="text-white"),
                            dbc.CardBody(
                                [
                                    html.H4(id="kpi-savings", className="card-title"),
                                    html.P("Total Savings", className="card-text"),
                                ]
                            ),
                        ],
                        className="kpi-card",
                    ),
                    dbc.Card(
                        [
                            dbc.CardHeader(savings_pct_label, className="text-white"),
                            dbc.CardBody(
                                [
                                    html.H4(
                                        id="kpi-savings-pct", className="card-title"
                                    ),
                                    html.P("Savings Percentage", className="card-text"),
                                ]
                            ),
                        ],
                        className="kpi-card",
                    ),
                ],
                className="kpi-container",
            ),
            # dropdown for selecting date granularity
            html.Div(
                [
                    dcc.Dropdown(
                        id="date-granularity",
                        options=[
                            {"label": "Months", "value": "M"},
                            {"label": "Quarters", "value": "Q"},
                            {"label": "Years", "value": "Y"},
                        ],
                        value="M",
                        clearable=False,
                        className="mb-3",
                    ),
                ],
                className="dropdown-container",
            ),
            # bar chart for income and costs
            dcc.Graph(id="income-costs-bar-chart"),
        ]
    )
