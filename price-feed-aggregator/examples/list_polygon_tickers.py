#!/usr/bin/env python3
"""
Utility script that queries the Price Feed Aggregator REST API to list available Polygon tickers.
"""

import argparse
import requests
import json
import sys

def list_polygon_tickers(api_host="localhost", api_port=8080):
    """
    Query the Price Feed Aggregator REST API to list available Polygon tickers.
    
    Args:
        api_host (str): API host address
        api_port (int): API port number
    """
    url = f"http://{api_host}:{api_port}/polygon/tickers"
    
    try:
        print(f"Querying API at {url}")
        response = requests.get(url)
        response.raise_for_status()  # Raise exception for HTTP errors
        
        data = response.json()
        tickers = data.get("tickers", [])
        
        if not tickers:
            print("No Polygon tickers available.")
            return
        
        # Print ticker information in a table format
        print("\nAvailable Polygon Tickers:")
        print("=" * 50)
        print(f"{'Ticker':<15} {'Symbol':<15} {'Name'}")
        print("-" * 50)
        
        for ticker_info in tickers:
            ticker = ticker_info.get("ticker", "")
            symbol = ticker_info.get("symbol", "")
            name = ticker_info.get("name", "")
            print(f"{ticker:<15} {symbol:<15} {name}")
            
        print("=" * 50)
        print(f"Total: {len(tickers)} tickers\n")
        
        print("Usage example:")
        print(f"  python polygon_only_subscription.py {tickers[0]['ticker']} {tickers[1]['ticker'] if len(tickers) > 1 else ''}")
        
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to the API at {url}")
        print("Make sure the Price Feed Aggregator service is running and the API is accessible.")
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e}")
    except Exception as e:
        print(f"Error: {e}")

def main():
    parser = argparse.ArgumentParser(description="List available Polygon tickers from the Price Feed Aggregator")
    parser.add_argument("--host", default="localhost", help="API host address")
    parser.add_argument("--port", type=int, default=8080, help="API port number")
    
    args = parser.parse_args()
    list_polygon_tickers(args.host, args.port)

if __name__ == "__main__":
    main()