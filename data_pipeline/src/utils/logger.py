import logging
import os

from config.settings import SETTINGS


def setup_logging(debug=False):
    """
    sets up logging for the application.

    :param debug: boolean flag to set logging level to DEBUG if True, else INFO.
    :param log_file: optional log file path. if not provided, logs will be printed to the console.
    """
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    log_level = logging.DEBUG if debug else logging.INFO

    # remove all handlers associated with the root logger object
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)

    logging.basicConfig(level=log_level, format=log_format)

    log_file = SETTINGS["log_file"]

    if log_file:
        # create log directory if it doesn't exist
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)

        # add file handler to the root logger
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter(log_format))
        logging.getLogger().addHandler(file_handler)

    # set chardet logger to warning level to reduce noise
    logging.getLogger("chardet.charsetprober").setLevel(logging.WARNING)
    logging.getLogger("chardet.universaldetector").setLevel(logging.WARNING)

    logging.debug("logging ok")


# example usage
if __name__ == "__main__":
    setup_logging(debug=True, log_file="logs/app.log")
