# PumpFun Transaction Analysis

## Reason for Project

I personally wanted a PumpFun monitor that gives me a notification when a coin as migrated. That's what the script is in current form. Now anyone can tweak the filters or add filters however they like. For example, if you only want coin notifications for coins that have at least 50 holders at migration and with at least 5 users with a wallet value of $30k or more.

## Overview

The **PumpFun Transaction Analysis** script is a Node.js application designed to monitor when a PumpFun coin migrates to Raydium and analyze user transactions in real-time. It connects to a WebSocket endpoint for live transaction logs and fetches detailed transaction data from Solana RPC's and associated APIs. This application aggregates token trading data, identifies patterns, and generates actionable insights for specific token addresses and user activity.

## Features

- **Real-Time Monitoring**: Listens to live transaction logs via a WebSocket connection.
- **Transaction Filtering**: Filters transactions based on specific criteria, including token balances and mint addresses.
- **Token Trading Analysis**: Tracks buy and sell activities, computes aggregated trading statistics, and calculates net token movements.
- **Mint Address Insights**: Identifies and processes unique mint addresses associated with transactions.
- **Historical Data Integration**: Fetches historical price data for mint tokens to calculate value in USD.
- **Custom Threshold Filtering**: Filters accounts and transactions based on token balance thresholds for better reporting.
- **Robust Error Handling**: Includes mechanisms to handle API errors, WebSocket reconnections, and duplicate transaction filtering.
- **Output Reporting**: Generates a JSON output summarizing trading activity, user statistics, and mint-specific insights.

## How It Works

1. WebSocket Connection: 
   The script establishes a WebSocket connection to listen for transactions involving a specific address.

2. Transaction Details Fetching: 
   When a matching transaction is detected, the script fetches detailed data from buyers using the Solana RPC API.

3. Mint Analysis: 
   The script identifies target mints from pre-token balances and retrieves related trades from the Pump.fun API.

4. Data Aggregation: 
   User trading data is aggregated, including token amounts, SOL values, buy/sell counts, and timestamps.

5. Threshold Filtering: 
   Filters out users or accounts below a configurable token balance threshold.

6. Output Generation: 
   Saves aggregated and processed data into a JSON file.

## Example Output

A sample output file will include is in the github named PumpFunTransactionOutputMAIN.json

## Error Handling

- Duplicate Transactions: Skips already-processed transactions using a `processedSignatures` set.
- WebSocket Reconnection: Automatically reconnects if the WebSocket connection is interrupted.
- API Failures: Logs errors when fetching transaction data or mint prices and retries as needed.