from dash import dcc, html
from src.visualization.layouts.overview import get_overview_layout
from config.settings import SETTINGS
from config.translations import translations


def get_tabs_layout():
    """
    returns the layout for the tabs, including the overview tab.
    """

    lang = SETTINGS["language"]
    overview_label = translations[lang]["overview"]

    return html.Div(
        [
            dcc.Tabs(
                [
                    dcc.Tab(
                        label=overview_label,
                        children=get_overview_layout(),
                        className="tab",
                        selected_className="tab--selected",
                    ),
                    dcc.Tab(
                        label="Tab 2",
                        children=html.Div("Content for Tab 2"),
                        className="tab",
                        selected_className="tab--selected",
                    ),
                    dcc.Tab(
                        label="Tab 3",
                        children=html.Div("Content for Tab 3"),
                        className="tab",
                        selected_className="tab--selected",
                    ),
                ],
                className="dash-tabs",
            )
        ]
    )
