import sys
import os

# Add the src directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from main import main

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="run the fire application")
    parser.add_argument(
        "-d", "--debug", action="store_true", help="run the application in debug mode"
    )
    args = parser.parse_args()

    main(debug=args.debug)
