/**
 * Fixtures that follow the structure of real brokerage exports, with invented numbers.
 *
 * Structures were checked against public sample exports and importers (see `src`). Where a source
 * only showed part of a file, or only described columns, the fixture's name says so. Robinhood,
 * Webull and Coinbase offer no positions export, so those are covered by pasted-page fixtures in
 * import-corpus.ts instead.
 */
export type RealFixture = {
  name: string
  inst: string
  src: string
  via: "table" | "ai" | "none"
  text: string
  /** [symbol, shares, average cost, account] — account null when the file has a single account. */
  expect: [string, number, number | null, string | null][]
}

export const REAL_FIXTURES: RealFixture[] = [
 {
  "name": "Schwab positions CSV, two accounts",
  "inst": "Schwab",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/schwab.csv (+ Importer.cs Schwab parser comments)",
  "via": "table",
  "text": "\"Positions for CUSTACCS as of 09:13 PM ET, 10/13/2026\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"Individual ...111\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"Symbol\",\"Description\",\"Quantity\",\"Price\",\"Price Change %\",\"Price Change $\",\"Market Value\",\"Day Change %\",\"Day Change $\",\"Cost Basis\",\"Gain/Loss %\",\"Gain/Loss $\",\"Ratings\",\"Reinvest Dividends?\",\"Capital Gains?\",\"% Of Account\",\"Security Type\"\n\"AMD\",\"ADVANCED MICRO DEVIC\",\"2.5\",\"$150.00\",\"-1.20%\",\"-$1.82\",\"$375.00\",\"-1.20%\",\"-$4.55\",\"$250.00\",\"50%\",\"$125.00\",\"C\",\"Yes\",\"--\",\"20%\",\"Equity\"\n\"KO\",\"COCA COLA CO\",\"10\",\"$60.00\",\"0.50%\",\"$0.30\",\"$600.00\",\"0.50%\",\"$3.00\",\"$500.00\",\"20%\",\"$100.00\",\"B\",\"Yes\",\"--\",\"30%\",\"Equity\"\n\"Cash & Cash Investments\",\"--\",\"--\",\"--\",\"--\",\"--\",\"$50.00\",\"0%\",\"$0.00\",\"--\",\"--\",\"--\",\"--\",\"--\",\"--\",\"1%\",\"Cash and Money Market\"\n\"Account Total\",\"--\",\"--\",\"--\",\"--\",\"--\",\"$1,025.00\",\"0.2%\",\"$1.00\",\"$750.00\",\"36%\",\"$225.00\",\"--\",\"--\",\"--\",\"--\",\"--\"\n\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"Roth IRA ...222\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"Symbol\",\"Description\",\"Quantity\",\"Price\",\"Price Change %\",\"Price Change $\",\"Market Value\",\"Day Change %\",\"Day Change $\",\"Cost Basis\",\"Gain/Loss %\",\"Gain/Loss $\",\"Ratings\",\"Reinvest Dividends?\",\"Capital Gains?\",\"% Of Account\",\"Security Type\"\n\"KO\",\"COCA COLA CO\",\"4\",\"$60.00\",\"0.50%\",\"$0.30\",\"$240.00\",\"0.50%\",\"$1.20\",\"$200.00\",\"20%\",\"$40.00\",\"B\",\"Yes\",\"--\",\"50%\",\"Equity\"\n\"SCHD\",\"SCHWAB US DIVIDEND EQUITY ETF\",\"20\",\"$28.00\",\"-0.20%\",\"-$0.06\",\"$560.00\",\"-0.20%\",\"-$1.20\",\"$480.00\",\"16.7%\",\"$80.00\",\"--\",\"No\",\"--\",\"50%\",\"ETFs & Closed End Funds\"\n\"Account Total\",\"--\",\"--\",\"--\",\"--\",\"--\",\"$800.00\",\"0.1%\",\"$0.50\",\"$680.00\",\"17.6%\",\"$120.00\",\"--\",\"--\",\"--\",\"--\",\"--\"",
  "expect": [
   [
    "AMD",
    2.5,
    100.0,
    "Individual ...111"
   ],
   [
    "KO",
    10,
    50.0,
    "Individual ...111"
   ],
   [
    "KO",
    4,
    50.0,
    "Roth IRA ...222"
   ],
   [
    "SCHD",
    20,
    24.0,
    "Roth IRA ...222"
   ]
  ]
 },
 {
  "name": "Schwab positions CSV, one account, options + short",
  "inst": "Schwab",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/schwab2.csv",
  "via": "table",
  "text": "\"Positions for CUSTACCS as of 09:13 PM ET, 10/13/2026\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"Individual ...123\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"Symbol\",\"Description\",\"Quantity\",\"Price\",\"Price Change %\",\"Price Change $\",\"Market Value\",\"Day Change %\",\"Day Change $\",\"Cost Basis\",\"Gain/Loss %\",\"Gain/Loss $\",\"Ratings\",\"Reinvest Dividends?\",\"Capital Gains?\",\"% Of Account\",\"Security Type\"\n\"AMD\",\"ADVANCED MICRO DEVIC\",\"2.5\",\"$150.00\",\"-1.20%\",\"-$1.82\",\"$375.00\",\"-1.20%\",\"-$4.55\",\"$250.00\",\"50%\",\"$125.00\",\"C\",\"Yes\",\"--\",\"20%\",\"Equity\"\n\"AAPL 11/20/2026 250.00 C\",\"APPLE INC CALL\",\"2\",\"$3.10\",\"1%\",\"$0.03\",\"$620.00\",\"1%\",\"$6.00\",\"$500.00\",\"24%\",\"$120.00\",\"--\",\"N/A\",\"N/A\",\"3%\",\"Option\"\n\"TSLA\",\"TESLA INC\",\"-5\",\"$376.34\",\"1%\",\"$1\",\"-$1,881.70\",\"1%\",\"$1\",\"$1,500.00\",\"1%\",\"$1\",\"--\",\"No\",\"--\",\"1%\",\"Equity\"\n\"Cash & Cash Investments\",\"--\",\"--\",\"--\",\"--\",\"--\",\"$5.20\",\"0%\",\"$0.00\",\"--\",\"--\",\"--\",\"--\",\"--\",\"--\",\"0.29%\",\"Cash and Money Market\"\n\"Account Total\",\"--\",\"--\",\"--\",\"--\",\"--\",\"$195.73\",\"-1.77%\",\"-$31.93\",\"$547.79\",\"33.1%\",\"$181.34\",\"--\",\"--\",\"--\",\"--\",\"--\"",
  "expect": [
   [
    "AMD",
    2.5,
    100.0,
    null
   ]
  ]
 },
 {
  "name": "Fidelity positions CSV: BOM, SPAXX**, CUSIP, n/a, three accounts, footers",
  "inst": "Fidelity",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/fidelity.csv; https://github.com/NimbleEngineer21/greenlight/blob/main/src/lib/parsers/fidelity.js",
  "via": "table",
  "text": "﻿Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type\r\nZ11111111,Our Brokerage,SPAXX**,FIDELITY GOVERNMENT MONEY MARKET,200.21,$1.00,$0.00,$200.21,n/a,n/a,n/a,n/a,100.00%,n/a,n/a,Cash\r\nZ11111111,Our Brokerage,912810FS2,United States Treasury 2.000...,44000,$98.484,$0.00,$43333.92,n/a,n/a,n/a,n/a,100.00%,n/a,n/a,Cash\r\n222222222,His HSA,FDRXX**,FIDELITY GOVERNMENT CASH RESERVES,4.2,$1.00,$0.00,$4.20,n/a,n/a,n/a,n/a,0.01%,n/a,n/a,Cash\r\n222222222,His HSA,VTI,VANGUARD INDEX FDS VANGUARD TOTAL STK MKT ETF,261.165,$197.98,-$2.97,$51705.44,-$775.67,-1.48%,-$10742.57,-17.21%,99.99%,$62448.01,$239.11,Cash\r\n456789012,Brokeragelink - His 401K,BND,VANGUARD BD INDEX FDS TOTAL BND MRKT,1884.209,$74.195,-$0.025,$139798.86,-$249.28,-0.04%,-$17928.16,-11.38%,56.67%,$157727.02,$83.71,Cash\r\n456789012,Brokeragelink - His 401K,VTI,VANGUARD INDEX FDS VANGUARD TOTAL STK MKT ETF,837.0239,$197.98,-$2.97,$165713.99,-$8486.57,-1.48%,-$16000.00,-8.84%,43.33%,$181775.00,$217.16,Cash\r\n456789012,Brokeragelink - His 401K,QQQ,INVESCO QQQ,10,$300.00,$1.00,$3000.00,$10.00,0.3%,n/a,n/a,1.0%,--,--,Cash\r\n\r\n\"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution. The spreadsheet is provided for informational purposes only, and is not intended to provide advice.\"\r\n\r\n\"Brokerage services are provided by Fidelity Brokerage Services LLC, 900 Salem Street, Smithfield, RI 02917. Custody and other services provided by National Financial Services LLC.\"\r\n\r\n\"Date downloaded 01/25/2023 10:44 AM ET\"",
  "expect": [
   [
    "912810FS2",
    44000,
    null,
    "Our Brokerage"
   ],
   [
    "VTI",
    261.165,
    239.11,
    "His HSA"
   ],
   [
    "BND",
    1884.209,
    83.71,
    "Brokeragelink - His 401K"
   ],
   [
    "VTI",
    837.0239,
    217.16,
    "Brokeragelink - His 401K"
   ],
   [
    "QQQ",
    10,
    null,
    "Brokeragelink - His 401K"
   ]
  ]
 },
 {
  "name": "Vanguard holdings CSV with transactions table below",
  "inst": "Vanguard",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/vanguard.csv",
  "via": "table",
  "text": "Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,\n98765432,VANGUARD TOTAL BOND MARKET ETF,BND,10.000,74.32,743.20,\n98765432,Vanguard Federal Money Market Fund,VMFXX,1.000,1.0,1.00,\n\n87654321,VANGUARD TOTAL INTL STOCK INDEX FUND ETF,VXUS,100.000,56.01,5601.00,\n87654321,VANGUARD TOTAL STOCK MARKET ETF,VTI,10.000,198.305,1983.05,\n\n\n\nAccount Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commission Fees,Net Amount,Accrued Interest,Account Type,\n98765432,12/29/2022,12/29/2022,Dividend,Dividend Received,VANGUARD TOTAL BOND MARKET ETF,BND,0.0,1.0,200.5,0.0,200.5,0.0,Cash,\n98765432,12/29/2022,12/29/2022,Reinvestment,Dividend Reinvestment,VANGUARD TOTAL BOND MARKET ETF,BND,2.0,100.25,-200.5,0.0,-584.5,0.0,Cash,",
  "expect": [
   [
    "BND",
    10,
    null,
    "98765432"
   ],
   [
    "VXUS",
    100,
    null,
    "87654321"
   ],
   [
    "VTI",
    10,
    null,
    "87654321"
   ]
  ]
 },
 {
  "name": "Vanguard 401(k) plan CSV (no ticker column)",
  "inst": "Vanguard plan",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/vanguard.csv (plan section)",
  "via": "ai",
  "text": "Plan Number,Plan Name,Fund Name,Shares,Price,Total Value,\n076545,SOME INC. 401(K) PLAN,Vanguard Total International Stock Index Fund Institutional Shares,1.000,122.15000000,122.15,\n076545,SOME INC. 401(K) PLAN,Vanguard Total Bond Market Index Fund Institutional Shares,1.000,9.66000000,9.66,",
  "expect": []
 },
 {
  "name": "Vanguard legacy CSV (Fund Name, no ticker, 'Total 327.50')",
  "inst": "Vanguard legacy",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/vanguard-orig.csv",
  "via": "ai",
  "text": "Fund Account Number,Fund Name,Price,Shares,Total Value,\n0584-12345678,Vanguard Total Bond Market Index Fund Admiral Shares,9.49,10,94.90,\n0570-12345678,Vanguard FTSE All-World ex-US Index Fund Admiral Shares,32.75,10,Total 327.50,",
  "expect": []
 },
 {
  "name": "E*TRADE portfolio download CSV (decoy header, CASH, TOTAL)",
  "inst": "E*TRADE",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/etrade-PortfolioDownload.csv",
  "via": "table",
  "text": "Account Summary,,,,,,,,,\nAccount,Net Account Value,Total Gain $,Total Gain %,Day's Gain Unrealized $,Day's Gain Unrealized %,Available For Withdrawal,Marginable Securities,Non-Marginable Securities,\n\"Individual Brokerage -####\",200770.00,20000.14,14.4,-1017.61,-2.1,200770.00,200770.00,0.0,\n,,,,,,,,,\n,,,,,,,,,\nView Summary - All Positions,,,,,,,,,\nFilters applied: ,,,,,,,,,\nSymbol,Security type(s),Sort by,Sort order,,,,,,\n,All,Total Gain $,Asc,,,,,,\n,,,,,,,,,\nSymbol,Last Price $,Change $,Change %,Quantity,Price Paid $,Day's Gain $,Total Gain $,Total Gain %,Value $\nVTI,200.77,-4.31,-2.1,10.0000,180.8802,-43.1000,199.0000,10.9,2007.700\nVXUS,56.01,0.10,0.2,100.0000,50.0000,10.0000,601.0000,12.0,5601.000\nCASH,,,,,,,,,12.2\nTOTAL,,,,,6808.80,-33.10,800.00,11.7,7608.70\n,,,,,,,,,\n,,,,,,,,,\nGenerated at Feb 14 2023 03:12 PM ET,,,,,,,,,",
  "expect": [
   [
    "VTI",
    10,
    180.8802,
    null
   ],
   [
    "VXUS",
    100,
    50.0,
    null
   ]
  ]
 },
 {
  "name": "Merrill Edge holdings CSV (quoted, thousands separators, Value ($))",
  "inst": "Merrill Edge",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/merillEdge.csv",
  "via": "table",
  "text": "\"COB Date\",\"Security #\",\"Symbol\",\"CUSIP #\",\"Security Description\",\"Account Nickname\",\"Account Registration\",\"Account #\",\"Quantity\",\"Price ($)\",\"Value ($)\",\"Unrealized Gain/Loss ($)\",\"Unrealized Gain/Loss (%)\",\"Cumulative Investment Return ($)\",\"Cumulative Investment Return (%)\",\"Accrued Interest ($)\"\n\"10/13/2026\",\"12345\",\"FUNDX\",\"123456789\",\"MY FUND X\",\"--\",\"CMA-Edge\",\"99X-12345\",\"10,000\",\"1.23\",\"12,300.00\",\"2,300.00\",\"23.00\",\"2,300\",\"23.00\",\"--\"\n\"10/13/2026\",\"12346\",\"FUNDY\",\"123456788\",\"MY FUND Y\",\"--\",\"CMA-Edge\",\"99X-12345\",\"5,000\",\"1.23\",\"6,150.00\",\"2,300.00\",\"23.00\",\"2,300\",\"23.00\",\"--\"",
  "expect": [
   [
    "FUNDX",
    10000,
    null,
    "99X-12345"
   ],
   [
    "FUNDY",
    5000,
    null,
    "99X-12345"
   ]
  ]
 },
 {
  "name": "J.P. Morgan positions CSV (many columns, FOOTNOTES)",
  "inst": "J.P. Morgan",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/JPMorgan-Chase.csv",
  "via": "table",
  "text": "Asset Class,Asset Strategy,Asset Strategy Detail,Description,Ticker,CUSIP,Quantity,Base CCY,Local CCY,Price,PriceInd,Local Price,Today's Price Change,Price Change %,Pricing Date,Value,Today's Value Change,Value Change %,Local Value,Cost,Unit Cost,Local Unit Cost,Orig Cost (Base),Orig Cost (Local),Cost Source,Local Cost\n\"Equity\",\"US Large Cap Equity\",\"\",\"VANGUARD S&P 500 ETF\",\"VOO\",\"922908363\",\"1.15764\",\"USD\",\"\",\"429.98\",\"false\",\"\",\"0.55\",\"0.13\",\"01/05/2024 04:16:48 PM\",\"497.76\",\"1.29\",\"0.13\",\"\",\"300\",\"259.16\",\"\",\"104892\",\"\",\"\",\"\",\"\"\n\"Fixed Income & Cash\",\"Cash & Short Term\",\"\",\"VANGUARD TREASURY MONEY MARKET FUND INVESTOR SHARES\",\"VUSXX\",\"921932109\",\"1.67\",\"USD\",\"\",\"1\",\"false\",\"\",\"0\",\"0\",\"01/04/2024 11:59:59 PM\",\"1.67\",\"0\",\"0\",\"\",\"1.67\",\"1\",\"\",\"1.67\",\"\",\"\",\"\",\"\"\n\nFOOTNOTES\n M,\"An 'M' in the Quantity field denotes that there is a Memo Quantity on the position.\"\n P,\"'P' denotes a trade that's pending settlement.\"",
  "expect": [
   [
    "VOO",
    1.15764,
    259.16,
    null
   ]
  ]
 },
 {
  "name": "T. Rowe Price CSV (Account Name holds the fund name)",
  "inst": "T. Rowe Price",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/t-rowe-price.csv",
  "via": "table",
  "text": "\"Account Type\",\"Account Name\",\"Ticker\",\"Account Number\",\"Owners\",\"Quantity\",\"Price\",\"Change\",\"Market Value\",\"Daily $ Change\",\"Daily % Change\",\"PRR\"\n\"Rollover IRA\",\"Total Equity Market Index Fund\",\"POMIX\",\"7777-7\",\"Robert\",\"3\",\"$49.33\",\"$0.52\",\"$148\",\"$1\",\"1.07%\",\"9.97%\"\n\"Roth IRA\",\"Total Equity Market Index Fund\",\"POMIX\",\"1111-1\",\"Robert\",\"4\",\"$49.33\",\"$0.52\",\"$197\",\"$2\",\"1.07%\",\"13.98%\"",
  "expect": [
   [
    "POMIX",
    3,
    null,
    "Rollover IRA"
   ],
   [
    "POMIX",
    4,
    null,
    "Roth IRA"
   ]
  ]
 },
 {
  "name": "TIAA retirement CSV (ticker only in parentheses, plan label lines)",
  "inst": "TIAA",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/TIAA-multipleAccounts.csv",
  "via": "table",
  "text": "Data As of 07/02/2024,\nYour Investments,Total Value,Last Price,Quantity,Change since last close ($)*,Change since last close (%)*,\nUNIVERSITY OF EXAMPLE 401(A) RETIREMENT PLAN,\nTotal balance: $91864.78,\nVanguard Institutional Index Fund Institutional Plus (VIIIX),$91864.78,$453.2400,202.6845,$567.51,0.62%,\nUNIVERSITY OF EXAMPLE 403(B) PLAN,\nTotal balance: $25714.80,\nVanguard Institutional Index Fund Institutional Plus (VIIIX),$25714.80,$453.2400,56.7355,$158.86,0.62%,\nVanguard Total Bond Market Index Fund Institutional Plus (VBMPX),$6000.00,$9.4500,634.9206,$18.40,0.32%,",
  "expect": [
   [
    "VIIIX",
    202.6845,
    null,
    "UNIVERSITY OF EXAMPLE 401(A) RETIREMENT PLAN"
   ],
   [
    "VIIIX",
    56.7355,
    null,
    "UNIVERSITY OF EXAMPLE 403(B) PLAN"
   ],
   [
    "VBMPX",
    634.9206,
    null,
    "UNIVERSITY OF EXAMPLE 403(B) PLAN"
   ]
  ]
 },
 {
  "name": "TreasuryDirect clipboard (savings bonds, no tickers)",
  "inst": "TreasuryDirect",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/TreasuryDirect-viaClipboard.txt",
  "via": "none",
  "text": "Confirm #\tIssue Date\tInterest Rate\tStatus\tAmount\tCurrent Value\n\tXXXXX\t01-01-2024\t5.27%\t \t$10,000.00\t$10,000.00\n\tXXXXX\t01-01-2023\t4.35%\t \t$10,000.00\t$10,440.00",
  "expect": []
 },
 {
  "name": "Ameriprise positions CSV (sectioned summary; only first lines verified)",
  "inst": "Ameriprise",
  "src": "https://github.com/multifol-io/financial-variables/tree/main/data/custodians/Ameriprise-PortfolioPositions_m-dd-yyyy.csv",
  "via": "none",
  "text": "\"AMERIPRISE BROKERAGE\",\"ALL_ACCOUNTS\"\nAs of 02/13/2023 03:30 PM ET\n,\n\"Total Asset Value\",\"Brokerage Day Change\",\"Total Cash & Equivalents\"\n\"$3,000.00\",\"UNCH\",\"$5.00\"\n,\n\"Cash & Equivalents\"\n\"Type\",\"Account Name\",\"Account Description\",\"Mkt. Value\"\n\"Cash\",\"AMERIPRISE BROKERAGE\",\"**** 1234 5 678\",\"$5.00\"",
  "expect": []
 },
 {
  "name": "IBKR Activity Statement CSV (Open Positions section among others)",
  "inst": "Interactive Brokers",
  "src": "https://www.ibkrguides.com/reportingreference/reportguide/openpositions_realizedsummary.htm (column names); row/section layout from macroption.com description, not a verified file",
  "via": "table",
  "text": "Statement,Header,Field Name,Field Value\nStatement,Data,BrokerName,Interactive Brokers\nTrades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\nTrades,Data,Order,Stocks,USD,AAPL,\"2026-01-02, 09:30:00\",5,150,160,-750,-1,751,0,50,O\nOpen Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code\nOpen Positions,Data,Summary,Stocks,USD,AAPL,10,1,150,1500,160,1600,100,\nOpen Positions,Data,Summary,Stocks,USD,VOO,2.5,1,500,1250,520,1300,50,\nOpen Positions,Total,,Stocks,USD,,,,,2750,,2900,150,",
  "expect": [
   [
    "AAPL",
    10,
    150.0,
    null
   ],
   [
    "VOO",
    2.5,
    500.0,
    null
   ]
  ]
 },
 {
  "name": "Moomoo positions CSV ('Qty.', 'Avg Cost')",
  "inst": "Moomoo",
  "src": "https://github.com/saketnayak/trading-command-center/blob/main/backend/app/services/portfolio_parser.py (header detection)",
  "via": "table",
  "text": "Symbol,Name,Qty.,Avg Cost,Price,Market Value\nAAPL,Apple Inc.,12,191.22,341.28,4095.36\nNVDA,NVIDIA Corp,3.5,73.56,229.68,803.88",
  "expect": [
   [
    "AAPL",
    12,
    191.22,
    null
   ],
   [
    "NVDA",
    3.5,
    73.56,
    null
   ]
  ]
 }
]
