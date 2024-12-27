from dash import dcc, html
import dash_bootstrap_components as dbc
from src.visualization.base.tabs_layout import get_tabs_layout
import datetime


def get_global_layout():
    """
    returns the global layout including the date range picker and tabs.
    """
    # set default start and end dates to the current month
    today = datetime.date.today()
    first_day_of_month = today.replace(day=1)
    last_day_of_month = (first_day_of_month + datetime.timedelta(days=32)).replace(
        day=1
    ) - datetime.timedelta(days=1)

    return html.Div(
        [
            # main container with padding
            html.Div(
                [
                    # date range selection
                    dcc.DatePickerRange(
                        id="global-date-range",
                        start_date=first_day_of_month,
                        end_date=last_day_of_month,
                        display_format="YYYY-MM-DD",
                        clearable=True,
                        className="mb-3",
                    ),
                    # store for filtered data
                    dcc.Store(id="filtered-data"),
                    # tabs
                    get_tabs_layout(),
                ],
                className="main-container",
            )
        ]
    )
