import fs from 'fs';
import WebSocket from 'ws';
import fetch from 'node-fetch';

// WebSocket and RPC endpoint URLs for the Solana blockchain
const wsUrl = 'wss://mainnet.helius-rpc.com/?api-key=06363dbe-a14e-410b-a5e1-8c67b969c11f';
const rpcUrl = 'https://solana-mainnet.core.chainstack.com/10d7061b46a2397075617b518a4ff18e';
const address = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

// Arrays and objects to store processed data
const transactionOutputs = [];
const processedSignatures = new Set(); // Tracks processed transaction signatures to avoid duplicates
const aggregatedData = {}; // Stores aggregated trade data per token mint
const timeDifferences = {}; // Tracks time differences between first and last trades per mint

const outputFile = './PumpFunTransactionOutputMAIN.json';
const apiUrl = 'https://api.jup.ag/price/v2?ids';

// List of stablecoin mints to always include
const alwaysIncludeMints = [
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'So11111111111111111111111111111111111111112'
];

let ws; // WebSocket connection instance

// Function to establish a WebSocket connection
function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log('WebSocket connection established.');

        // Subscribes to logs for the specified address
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'logsSubscribe',
            params: [
                { mentions: [address] },
                { commitment: 'finalized' },
            ],
        }));
    });

    // Handles incoming WebSocket messages
    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.params && parsedMessage.params.result) {
            const { logs, signature } = parsedMessage.params.result.value;

            if (!processedSignatures.has(signature)) {
                processedSignatures.add(signature); // Mark the signature as processed
                if (logs.some(log => log.includes('Program log: initialize2: InitializeInstruction2'))) {
                    console.log('Transaction Signature:', signature);
                    fetchTransactionData(signature); // Fetch details for the transaction
                }
            } else {
                console.log(`Skipping duplicate signature: ${signature}`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed. Reconnecting...');
        setTimeout(connectWebSocket, 5000); // Reconnect after 5 seconds
    });
}

// Establish the WebSocket connection
connectWebSocket();

// Fetches transaction data for a specific signature
async function fetchTransactionData(signature) {
    const headers = { 'Content-Type': 'application/json' };
    const data = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
    };

    try {
        const response = await fetch(rpcUrl, { method: 'POST', headers, body: JSON.stringify(data) });

        if (response.ok) {
            const transactionData = await response.json();

            if (transactionData.result?.meta) {
                const preTokenBalances = transactionData.result.meta.preTokenBalances || [];
                const targetMint = preTokenBalances.find(balance => 
                    balance.mint !== 'So11111111111111111111111111111111111111112'
                )?.mint;

                if (targetMint) {
                    await fetchTradesForMint(targetMint, signature); // Fetch trades for the mint
                }
            }
        } else {
            console.error(`Failed to fetch transaction data for ${signature}:`, response.statusText);
        }
    } catch (error) {
        console.error(`Error fetching transaction data for ${signature}:`, error);
    }
}

// Fetches trade data for a specific mint from the Pump.fun API
async function fetchTradesForMint(targetMint, signature) {
    const apiUrl = `https://frontend-api.pump.fun/trades/all/${targetMint}?limit=1000&offset=0&minimumSize=0`;

    try {
        const response = await fetch(apiUrl);

        if (response.ok) {
            const trades = await response.json();
            processTrades(targetMint, trades); // Process the trade data
        } else {
            console.error(`Failed to fetch trades for ${targetMint}:`, response.statusText);
        }
    } catch (error) {
        console.error(`Error fetching trades for ${targetMint}:`, error);
    }
}

// Processes trade data and aggregates results
function processTrades(targetMint, trades) {
    if (!aggregatedData[targetMint]) {
        aggregatedData[targetMint] = {}; // Initialize data structure for the token mint
        timeDifferences[targetMint] = { minTimestamp: null, maxTimestamp: null }; // Initialize time tracking
    }

    trades.forEach(trade => {
        const user = trade.user; // User involved in the trade
        const tokenAmount = trade.token_amount / 1e6; // Token amount in human-readable format
        const solAmount = (trade.sol_amount || 0) / 1e9; // SOL amount in human-readable format
        const isBuy = trade.is_buy; // Boolean indicating if the trade is a buy
        const timestamp = trade.timestamp; // Timestamp of the trade

        // Update min and max timestamps for the token mint
        if (timeDifferences[targetMint].minTimestamp === null || timestamp < timeDifferences[targetMint].minTimestamp) {
            timeDifferences[targetMint].minTimestamp = timestamp;
        }
        if (timeDifferences[targetMint].maxTimestamp === null || timestamp > timeDifferences[targetMint].maxTimestamp) {
            timeDifferences[targetMint].maxTimestamp = timestamp;
        }

        // Initialize user data if not already present
        if (!aggregatedData[targetMint][user]) {
            aggregatedData[targetMint][user] = {
                buyTokenAmount: 0,
                sellTokenAmount: 0,
                buySolAmount: 0,
                sellSolAmount: 0,
                buys: 0,
                sells: 0
            };
        }

        // Update user trade data based on trade type
        if (isBuy) {
            aggregatedData[targetMint][user].buyTokenAmount += tokenAmount;
            aggregatedData[targetMint][user].buySolAmount += solAmount;
            aggregatedData[targetMint][user].buys += 1;
        } else {
            aggregatedData[targetMint][user].sellTokenAmount += tokenAmount;
            aggregatedData[targetMint][user].sellSolAmount += solAmount;
            aggregatedData[targetMint][user].sells += 1;
        }
    });

    saveResults(); // Save the aggregated results
}

// Saves aggregated data to a file
function saveResults() {
    const results = {};
    Object.keys(aggregatedData).forEach(targetMint => {
        const users = aggregatedData[targetMint];

        // Sort users by total token amount traded
        const sortedUsers = Object.entries(users)
            .sort(([, dataA], [, dataB]) => (dataB.buyTokenAmount + dataB.sellTokenAmount) - (dataA.buyTokenAmount + dataA.sellTokenAmount));

        results[targetMint] = {
            users: sortedUsers.map(([user, { buyTokenAmount, sellTokenAmount, buySolAmount, sellSolAmount, buys, sells }]) => ({
                user,
                buyTokenAmount,
                sellTokenAmount,
                buySolAmount,
                sellSolAmount,
                buys,
                sells
            })),
            timeDifference: timeDifferences[targetMint].maxTimestamp - timeDifferences[targetMint].minTimestamp
        };
    });

    processFinalData(results); // Further process the results
}

// Further processes the final data, fetching token account and price information
async function processFinalData(data) {
    const outputData = {};
    const filteredMintAddresses = new Set();

    for (const tokenAddress in data) {
        if (data.hasOwnProperty(tokenAddress)) {
            console.log(`Processing token address: ${tokenAddress}`);

            const users = data[tokenAddress].users;

            // Count total users before applying the filter
            const totalUsersBeforeFilter = users.length;
            console.log(`Total users before filter for ${tokenAddress}: ${totalUsersBeforeFilter}`);
            outputData[tokenAddress] = { totalUsersBeforeFilter };

            // Calculate net token amount for each user
            users.forEach(user => {
                user.netTokenAmount = user.buyTokenAmount - user.sellTokenAmount;
            });

            const totalSold = users.filter(user => user.buyTokenAmount === 0 && user.sellTokenAmount > 0)
                .reduce((sum, user) => sum + user.sellTokenAmount, 0);

            const timeDifference = data[tokenAddress].timeDifference || 0;
            const timeToBond = convertSecondsToTime(timeDifference);

            outputData[tokenAddress] = {
                ...outputData[tokenAddress], // Include total users before filter
                totalSold,
                TimeToBond: timeToBond,
                users: []
            };

            const filteredUsers = users.filter(user => user.netTokenAmount >= 2000000);

            for (const user of filteredUsers) {
                const userAddress = user.user;
                console.log(`Fetching data for user: ${userAddress}`);

                const rpcResult = await getTokenAccountsByOwner(userAddress);
                const balanceResult = await getBalance(userAddress);

                if (rpcResult) {
                    let validAccounts = rpcResult.result?.value.map(account => {
                        const amount = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmountString || '0');
                        const mint = account.account.data.parsed.info.mint;

                        return {
                            mint,
                            amount,
                            owner: account.account.data.parsed.info.owner,
                            uiAmount: parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount),
                            uiAmountString: account.account.data.parsed.info.tokenAmount.uiAmountString
                        };
                    });

                    // Sort and filter top 15 mints per user
                    validAccounts = validAccounts
                        .sort((a, b) => b.amount - a.amount) // Sort descending by amount
                        .filter((_, index) => index < 15 || alwaysIncludeMints.includes(_.mint));

                    const solBalance = balanceResult;

                    if (validAccounts && validAccounts.length > 0) {
                        outputData[tokenAddress].users.push({
                            user: userAddress,
                            accounts: validAccounts,
                            solBalance,
                            netTokenAmount: user.netTokenAmount
                        });

                        validAccounts.forEach(account => {
                            if (account.amount >= 20000 || alwaysIncludeMints.includes(account.mint)) {
                                filteredMintAddresses.add(account.mint);
                            }
                        });
                    }
                }
            }
        }
    }

    console.log(`Found ${filteredMintAddresses.size} unique filtered mint addresses.`);
    const mintPrices = await fetchMintDataBatch(filteredMintAddresses);

    for (const tokenAddress in outputData) {
        if (outputData.hasOwnProperty(tokenAddress)) {
            outputData[tokenAddress].users.forEach(user => {
                let totalValue = 0;
                let stablecoinTotal = 0;

                user.accounts.forEach(account => {
                    const price = mintPrices[account.mint] || 0;
                    account.price = price;
                    account.value = account.uiAmount * price;

                    totalValue += account.value;

                    if (['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'].includes(account.mint)) {
                        stablecoinTotal += account.value;
                    }
                });

                user.accounts = user.accounts.filter(account => account.value >= 20);
                user.totalValue = totalValue + user.solBalance;
                user.stablecoins = stablecoinTotal;
            });
        }
    }

    try {
        fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
        console.log(`Results written to ${outputFile}`);
    } catch (error) {
        console.error('Error writing to output file:', error);
    }
}

// Converts seconds to a human-readable time format
function convertSecondsToTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds %= 24 * 60 * 60;
    const hours = Math.floor(seconds / (60 * 60));
    seconds %= 60 * 60;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}

// Fetches price data for a batch of mints
async function fetchMintDataBatch(mints) {
    const mintPrices = {};
    const batchSize = 100;
    const rateLimit = 5;
    const interval = 1000 / rateLimit;

    const mintArray = Array.from(mints);

    for (let i = 0; i < mintArray.length; i += batchSize) {
        const batch = mintArray.slice(i, i + batchSize);
        const apiEndpoint = `${apiUrl}=${batch.join(',')}`;

        try {
            const response = await fetch(apiEndpoint, {
                method: 'GET',
                headers: { 'accept': '*/*' },
            });

            if (response.ok) {
                const result = await response.json();
                Object.keys(result.data).forEach(mint => {
                    mintPrices[mint] = parseFloat(result.data[mint]?.price || 0);
                });
            } else {
                console.error(`Failed to fetch data for batch starting at index ${i}. Status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching data for batch starting at index ${i}:`, error.message);
        }

        if (i + batchSize < mintArray.length) {
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }

    return mintPrices;
}

// Fetches token account data for a user
async function getTokenAccountsByOwner(userAddress) {
    const rpcPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
            userAddress,
            { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
            { encoding: "jsonParsed" }
        ]
    };

    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rpcPayload)
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error(`Error fetching data for user ${userAddress}:`, error);
        return null;
    }
}

// Fetches balance data for a user
async function getBalance(userAddress) {
    const rpcPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [userAddress]
    };

    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rpcPayload)
        });

        const result = await response.json();
        if (result?.result?.value) {
            return result.result.value / 1e9; // Convert balance to SOL
        }
        return 0;
    } catch (error) {
        console.error(`Error fetching balance for user ${userAddress}:`, error);
        return 0;
    }
}
