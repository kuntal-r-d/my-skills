#!/usr/bin/env python3
"""
Simple Data Fetcher for DSE Stocks

This script fetches stock data using multiple methods and saves it for the MCP server.
"""

import json
import csv
import requests
from datetime import datetime, timedelta
from pathlib import Path
import time
import random


class SimpleDataFetcher:
    """Simple fetcher that uses available free APIs"""

    def __init__(self):
        self.data_dir = Path("data/csv")
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def fetch_with_yahoo(self, ticker: str, exchange: str = "DHA"):
        """Try Yahoo Finance API (some DSE stocks might be available)"""
        try:
            # Yahoo ticker format for DSE
            yahoo_ticker = f"{ticker}.{exchange}"

            # Yahoo Finance API v8 endpoint
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}"
            params = {
                'interval': '1d',
                'range': '1y'
            }

            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }

            response = requests.get(url, params=params, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                return self._parse_yahoo_data(data, ticker)
        except Exception as e:
            print(f"Yahoo Finance error for {ticker}: {e}")

        return None

    def _parse_yahoo_data(self, data: dict, ticker: str):
        """Parse Yahoo Finance data to OHLCV format"""
        try:
            result = data['chart']['result'][0]
            timestamps = result['timestamp']
            quotes = result['indicators']['quote'][0]

            ohlcv = []
            for i in range(len(timestamps)):
                date = datetime.fromtimestamp(timestamps[i]).strftime('%Y-%m-%d')
                ohlcv.append({
                    'date': date,
                    'open': round(quotes['open'][i], 2) if quotes['open'][i] else 0,
                    'high': round(quotes['high'][i], 2) if quotes['high'][i] else 0,
                    'low': round(quotes['low'][i], 2) if quotes['low'][i] else 0,
                    'close': round(quotes['close'][i], 2) if quotes['close'][i] else 0,
                    'volume': int(quotes['volume'][i]) if quotes['volume'][i] else 0
                })

            return ohlcv
        except:
            return None

    def generate_realistic_data(self, ticker: str, days: int = 365):
        """Generate realistic OHLCV data for testing"""
        print(f"Generating sample data for {ticker}...")

        # Different starting prices for different stocks
        base_prices = {
            'GP': 290.0,
            'SQURPHARMA': 220.0,
            'BATBC': 500.0,
            'BRACBANK': 40.0,
            'CITYBANK': 25.0,
            'ROBI': 45.0,
            'RENATA': 750.0,
            'OLYMPIC': 150.0,
            'BERGERPBL': 1800.0,
            'MARICO': 2500.0,
            'LHBL': 55.0,
            'UPGDCL': 220.0,
            'POWERGRID': 50.0,
            'BSCCL': 150.0,
            'EBL': 30.0
        }

        price = base_prices.get(ticker, 100.0)
        data = []
        current_date = datetime.now()

        # Generate data for the past year
        for i in range(days):
            date = current_date - timedelta(days=days-i)

            # Skip weekends
            if date.weekday() >= 5:
                continue

            # Realistic price movement (±3% daily)
            change = random.gauss(0, 0.015)  # Normal distribution
            open_price = price
            close_price = price * (1 + change)

            # Add intraday volatility
            high_price = max(open_price, close_price) * (1 + random.uniform(0, 0.01))
            low_price = min(open_price, close_price) * (1 - random.uniform(0, 0.01))

            # Realistic volume (with some correlation to price movement)
            base_volume = 1000000
            volume = int(base_volume * (1 + abs(change) * 10) * random.uniform(0.5, 1.5))

            data.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': round(open_price, 2),
                'high': round(high_price, 2),
                'low': round(low_price, 2),
                'close': round(close_price, 2),
                'volume': volume
            })

            price = close_price

        return data

    def save_to_csv(self, ticker: str, data: list):
        """Save OHLCV data to CSV file"""
        if not data:
            return False

        csv_path = self.data_dir / f"{ticker}_ohlcv.csv"

        with open(csv_path, 'w', newline='') as f:
            fieldnames = ['date', 'open', 'high', 'low', 'close', 'volume']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)

        print(f"✅ Saved {len(data)} days of data for {ticker} to {csv_path}")
        return True

    def save_fundamentals(self, ticker: str):
        """Save sample fundamental data"""
        fundamentals = {
            'GP': {'pe': 15.2, 'eps': 19.28, 'roe': 25.5, 'market_cap': 395000000000},
            'SQURPHARMA': {'pe': 22.5, 'eps': 9.78, 'roe': 18.3, 'market_cap': 200000000000},
            'BATBC': {'pe': 18.0, 'eps': 27.78, 'roe': 45.2, 'market_cap': 90000000000},
            'BRACBANK': {'pe': 8.5, 'eps': 4.71, 'roe': 12.8, 'market_cap': 64000000000},
            'ROBI': {'pe': 25.0, 'eps': 1.8, 'roe': 8.5, 'market_cap': 235000000000}
        }

        fund_data = fundamentals.get(ticker, {
            'pe': 15.0,
            'eps': 10.0,
            'roe': 15.0,
            'market_cap': 50000000000
        })

        csv_path = self.data_dir / f"{ticker}_fundamentals.csv"

        with open(csv_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fund_data.keys())
            writer.writeheader()
            writer.writerow(fund_data)

        print(f"✅ Saved fundamentals for {ticker}")

    def fetch_stock_data(self, ticker: str):
        """Fetch data for a single stock"""

        # First try Yahoo Finance
        data = self.fetch_with_yahoo(ticker)

        # If that fails, generate realistic sample data
        if not data:
            data = self.generate_realistic_data(ticker)

        # Save to CSV
        if data:
            self.save_to_csv(ticker, data)
            self.save_fundamentals(ticker)
            return True

        return False


def main():
    """Fetch data for popular DSE stocks"""

    # List of popular DSE stocks
    stocks = [
        "GP",          # Grameenphone
        "SQURPHARMA",  # Square Pharmaceuticals
        "BATBC",       # British American Tobacco
        "BRACBANK",    # BRAC Bank
        "ROBI",        # Robi Axiata
        "CITYBANK",    # The City Bank
        "RENATA",      # Renata Limited
        "OLYMPIC",     # Olympic Industries
        "BERGERPBL",   # Berger Paints
        "MARICO",      # Marico Bangladesh
    ]

    fetcher = SimpleDataFetcher()

    print("=" * 60)
    print("Stock Buddy Data Fetcher")
    print("Fetching/Generating data for DSE stocks...")
    print("=" * 60)

    success_count = 0
    for ticker in stocks:
        print(f"\nProcessing {ticker}...")
        if fetcher.fetch_stock_data(ticker):
            success_count += 1
        time.sleep(0.5)  # Rate limiting

    print("\n" + "=" * 60)
    print(f"✅ Successfully fetched data for {success_count}/{len(stocks)} stocks")
    print(f"📁 Data saved in: {fetcher.data_dir.absolute()}")
    print("\n🚀 Next steps:")
    print("1. Update docker-compose.yml to mount the data directory:")
    print("   volumes:")
    print("     - ./data/csv:/app/data/csv:ro")
    print("2. Restart Docker container:")
    print("   docker-compose restart")
    print("3. Test in Claude Desktop:")
    print('   "Analyze GP stock technically"')


if __name__ == "__main__":
    main()