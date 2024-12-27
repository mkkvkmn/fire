import plotly.express as px
import plotly.graph_objects as go
from config.settings import SETTINGS
from config.translations import translations


def format_value(value):
    """
    formats the value according to the settings.

    parameters:
    - value: the value to format.

    returns:
    - the formatted value as a string.
    """
    thousand_separator = SETTINGS.get("thousand_separator", ",")
    return f"{value:,.0f}".replace(",", thousand_separator)


def create_bar_chart(data, x, y, color, title, desired_classes):
    # filter the dataframe to include only the desired classes
    data_filtered = data[data[color].isin(desired_classes)]

    # get locale settings
    language = SETTINGS["language"]
    locale = translations[language]["locale"]
    currency_prefix = locale["currency"][0]
    currency_suffix = locale["currency"][1]
    thousands_sep = locale["thousands"]
    decimal_sep = locale["decimal"]

    # create bar chart
    fig = px.bar(
        data_filtered,
        x=x,
        y=y,
        color=color,
        barmode="group",
        title=title,
        template="plotly_dark",
    )

    # remove labels
    fig.update_layout(
        xaxis_title="",
        yaxis_title="",
        legend_title_text="",
    )

    fig.update_yaxes(
        tickprefix=currency_prefix,
        ticksuffix=currency_suffix,
        separatethousands=True,
    )

    # format hover text
    hovertemplate = (
        f"%{{x}}<br>{currency_prefix}%{{y:,.0f}}{currency_suffix}<extra></extra>"
    )
    hovertemplate = hovertemplate.replace(",", thousands_sep).replace(".", decimal_sep)
    fig.update_traces(hovertemplate=hovertemplate)

    return fig
