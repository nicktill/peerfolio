/**
 * Synthetic copies of what brokerages show or export, written from their public layouts
 * (column names, footers, cash rows, option rows). Numbers are invented; no real accounts.
 *
 * `via: "table"` means the local reader must get every row right. `via: "ai"` means the layout
 * has no usable structure, so the local reader must decline (null) rather than guess, and the
 * AI reader takes over.
 */
export type Expected = [symbol: string, quantity: number, avgCost: number | null]
export type Fixture = { name: string; via: "table" | "ai" | "none"; text: string; expect: Expected[]; note?: string }

const t = (...rows: string[][]) => rows.map((r) => r.join("\t")).join("\n")

export const FIXTURES: Fixture[] = [
  {
    name: "Robinhood web (vertical)",
    via: "table",
    text: ["Stocks & options", "94.82%", "$151,732.53", "Individual cash", "5.18%", "$8,286.74", "Stocks", "Name", "Symbol", "Shares", "Price", "Average cost", "Total return", "Equity",
      "AMD", "AMD", "22.5", "$612.34", "$140.63", "$10,613.47", "$13,777.65",
      "Invesco S&P 500 Equal Weight ETF", "RSP", "20.076", "$213.31", "$218.73", "$108.88", "$4,282.34"].join("\n"),
    expect: [["AMD", 22.5, 140.63], ["RSP", 20.076, 218.73]],
  },
  {
    name: "Robinhood web, extra columns, a loss, then an options section",
    via: "table",
    text: ["Stocks", "Name", "Symbol", "Shares", "Price", "Average cost", "Today's return", "Total return", "Equity", "Portfolio diversity",
      "Tesla", "TSLA", "11", "$376.34", "$186.06", "$12.10", "$2,093.06", "$4,139.74", "2.7%",
      "State Street Health Care Select Sector SPDR ETF", "XLV", "10.038", "$169.67", "$173.08", "-$1.20", "-$34.24", "$1,703.08", "1.1%",
      "Options", "Name", "Contracts", "Type", "Expires", "AAPL $250 Call", "2", "Call", "11/20/2026"].join("\n"),
    expect: [["TSLA", 11, 186.06], ["XLV", 10.038, 173.08]],
  },
  {
    name: "Fidelity positions CSV (pending, SPAXX, footer)",
    via: "table",
    text: [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type",
      'Z12345678,Individual,AAPL,APPLE INC,12.045,$341.28,+$1.20,"$4,110.74",+$14.45,+0.35%,"+$1,807.44",+78.47%,25.1%,"$2,303.30",$191.22,Cash',
      'Z12345678,Individual,BRKB,BERKSHIRE HATHAWAY INC CL B,3,$480.10,-$2.00,"$1,440.30",-$6.00,-0.41%,+$240.30,+20.03%,8.8%,"$1,200.00",$400.00,Cash',
      "Z12345678,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$6634.91,,,,,40.5%,,,Cash",
      "Z12345678,Individual,Pending Activity,,,,,-$120.00,,,,,,,,",
      "",
      '"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution."',
      '"Date downloaded Oct-13-2026 10:02 am"',
    ].join("\r\n"),
    expect: [["AAPL", 12.045, 2303.3 / 12.045], ["BRKB", 3, 400]],
  },
  {
    name: "Fidelity multi-account CSV",
    via: "table",
    text: [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Average Cost Basis",
      "X1,Individual,VOO,VANGUARD S&P 500 ETF,5,$700.00,$3500.00,$3000.00,$600.00",
      "X2,ROTH IRA,VOO,VANGUARD S&P 500 ETF,10,$700.00,$7000.00,$5000.00,$500.00",
    ].join("\n"),
    expect: [["VOO", 5, 600], ["VOO", 10, 500]],
  },
  {
    name: "Fidelity NetBenefits 401(k) copy",
    via: "table",
    text: t(
      ["Investment", "Shares", "Price", "Balance"],
      ["FIDELITY 500 INDEX FUND (FXAIX)", "120.455", "$210.10", "$25,307.95"],
      ["FIDELITY CONTRAFUND (FCNTX)", "300.1", "$22.50", "$6,752.25"],
    ),
    expect: [["FXAIX", 120.455, null], ["FCNTX", 300.1, null]],
    note: "Ticker in parentheses, columns resolved by shares × price = balance",
  },
  {
    name: "Schwab positions CSV (options, cash, total)",
    via: "table",
    text: [
      '"Positions for account Individual ...123 as of 04:12 PM ET, 10/13/2026"',
      "",
      '"Symbol","Description","Quantity","Price","Price Change %","Price Change $","Market Value","Day Change %","Day Change $","Cost Basis","Gain/Loss $","Gain/Loss %","Ratings","Reinvest?","Reinvest Capital Gains?","% of Account","Asset Type"',
      '"AAPL","APPLE INC","12.045","$341.28","0.35%","$1.20","$4,110.74","0.35%","$14.45","$2,303.30","$1,807.44","78.47%","B","Yes","N/A","20%","Equity"',
      '"SCHD","SCHWAB US DIVIDEND EQUITY ETF","100","$28.10","-0.2%","-$0.06","$2,810.00","-0.2%","-$6.00","$2,400.00","$410.00","17.08%","--","No","N/A","14%","ETFs & Closed End Funds"',
      '"AAPL 11/20/2026 250.00 C","APPLE INC CALL","2","$3.10","1%","$0.03","$620.00","1%","$6.00","$500.00","$120.00","24%","--","N/A","N/A","3%","Option"',
      '"Cash & Cash Investments","--","--","--","0%","$0.00","$1,000.00","0%","$0.00","--","--","--","--","--","--","5%","Cash and Money Market"',
      '"Account Total","--","--","--","0%","--","$8,540.74","0%","--","$5,203.30","$2,337.44","--","--","--","--","--","--"',
    ].join("\n"),
    expect: [["AAPL", 12.045, 2303.3 / 12.045], ["SCHD", 100, 24]],
  },
  {
    name: "Vanguard holdings CSV (second table of transactions)",
    via: "table",
    text: [
      "Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,",
      "12345678,VANGUARD 500 INDEX FUND ADMIRAL,VFIAX,50.123,$520.10,26067.18,",
      "12345678,VANGUARD TOTAL BOND MARKET INDEX FUND ETF,BND,100,$72.50,7250.00,",
      "",
      "",
      "Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,",
      "12345678,2026-09-01,2026-09-01,Buy,Buy,VANGUARD 500 INDEX FUND ADMIRAL,VFIAX,1.0,$510.00,510.00,0.0,510.00,0,CASH,",
    ].join("\n"),
    expect: [["VFIAX", 50.123, null], ["BND", 100, null]],
  },
  {
    name: "E*TRADE portfolio CSV ($ and # in headers)",
    via: "table",
    text: [
      "Account Summary",
      "Net Account Value,Total Gain $,Day's Gain $,Available For Withdrawal",
      '"$12,000.00","$2,000.00","$10.00","$1,000.00"',
      "",
      "View Summary",
      "Symbol,Last Price $,Change $,Change %,Qty #,Price Paid $,Day's Gain $,Total Gain $,Total Gain %,Value $",
      "MSFT,543.21,1.10,0.20%,8.04,362.64,8.84,1451.89,49.80%,4367.64",
      "AMZN,258.96,-0.5,-0.19%,25,166.24,-12.5,2318.11,55.78%,6474.00",
      "TOTAL,,,,,,,,,10841.64",
    ].join("\n"),
    expect: [["MSFT", 8.04, 362.64], ["AMZN", 25, 166.24]],
  },
  {
    name: "Merrill Lynch holdings CSV (Unit Cost, Value ($))",
    via: "table",
    text: [
      "Symbol,Description,Quantity,Price,Value ($),Unit Cost ($),Cost Basis ($)",
      "GOOGL,ALPHABET INC CL A,10.021,355.62,3563.77,213.14,2135.88",
      "KO,COCA COLA CO,40,70.00,2800.00,55.00,2200.00",
    ].join("\n"),
    expect: [["GOOGL", 10.021, 2135.88 / 10.021], ["KO", 40, 55]],
  },
  {
    name: "Webull positions export",
    via: "table",
    text: 'Ticker,Name,Qty,Avg Cost,Last,Market Value,Unrealized P/L\nTSLA,"Tesla, Inc.",11,186.06,376.34,"4,139.74",2093.08\nNVDA,NVIDIA Corp,22.056,73.56,229.68,"5,065.76",3443.4',
    expect: [["TSLA", 11, 186.06], ["NVDA", 22.056, 73.56]],
  },
  {
    name: "Interactive Brokers portfolio copy",
    via: "table",
    text: t(
      ["Financial Instrument", "Position", "Last", "Change", "Avg Price", "Market Value", "Unrealized P&L"],
      ["IBKR", "20.019", "87.78", "0.4", "87.68", "1,757.27", "1.93"],
      ["SPY", "5", "650.10", "-1.2", "600.00", "3,250.50", "250.50"],
      ["Total", "", "", "", "", "5,007.77", ""],
    ),
    expect: [["IBKR", 20.019, 87.68], ["SPY", 5, 600]],
  },
  {
    name: "Public.com holdings copy",
    via: "table",
    text: t(
      ["Asset", "Shares", "Price", "Total value", "Total return"],
      ["PLTR", "60", "$208.59", "$12,515.40", "+$10,386.86"],
      ["HOOD", "100", "$111.17", "$11,117.00", "+$7,605.93"],
    ),
    expect: [["PLTR", 60, null], ["HOOD", 100, null]],
  },
  {
    name: "Ally Invest CSV",
    via: "table",
    text: ["Symbol,Description,Qty,Price,Value,Cost Basis", "VTI,VANGUARD TOTAL STOCK MARKET ETF,25,$290.10,$7252.50,$5262.50", "AGG,ISHARES CORE US AGGREGATE BOND ETF,30,$99.00,$2970.00,$3000.00"].join("\n"),
    expect: [["VTI", 25, 210.5], ["AGG", 30, 100]],
  },
  {
    name: "M1 Finance holdings copy",
    via: "table",
    text: t(["Ticker", "Shares", "Price", "Value", "Cost", "Gain"], ["VTI", "12.5", "$290.10", "$3,626.25", "$2,500.00", "$1,126.25"], ["SCHD", "40", "$28.10", "$1,124.00", "$1,000.00", "$124.00"]),
    expect: [["VTI", 12.5, 200], ["SCHD", 40, 25]],
  },
  {
    name: "Firstrade positions CSV",
    via: "table",
    text: ["Symbol,Quantity,Price,Description,Market Value,Cost Basis", "AAPL,10,341.28,APPLE INC,3412.80,1912.20", "SOFI,100,18.40,SOFI TECHNOLOGIES,1840.00,1500.00"].join("\n"),
    expect: [["AAPL", 10, 191.22], ["SOFI", 100, 15]],
  },
  {
    name: "tastytrade positions CSV (options, futures, short)",
    via: "table",
    text: [
      "Symbol,Instrument Type,Quantity,Average Open Price,Close Price,Mark",
      "AAPL,EQUITY,12,191.22,341.28,341.30",
      "AAPL  261120C00200000,EQUITY_OPTION,2,3.10,3.40,3.45",
      "/ESZ6,FUTURE,1,6000,6100,6101",
      "TSLA,EQUITY,-5,300,376.34,376.40",
    ].join("\n"),
    expect: [["AAPL", 12, 191.22]],
    note: "Option, future and short rows are listed as skipped",
  },
  {
    name: "Google Sheets copy (Cost/Share)",
    via: "table",
    text: t(["Ticker", "Shares", "Cost/Share", "Notes"], ["AAPL", "10", "$150.00", "core"], ["VTI", "25", "$210.50", ""], ["BRK.B", "2", "$400", "added Mar"]),
    expect: [["AAPL", 10, 150], ["VTI", 25, 210.5], ["BRK.B", 2, 400]],
  },
  {
    name: "Excel copy with Purchase Price",
    via: "table",
    text: t(["Stock", "Symbol", "Quantity", "Purchase Price"], ["Microsoft", "MSFT", "8", "310.25"], ["Costco", "COST", "2.53", "816.24"]),
    expect: [["MSFT", 8, 310.25], ["COST", 2.53, 816.24]],
  },
  {
    name: "European decimals, semicolons",
    via: "table",
    text: ["Symbol;Anzahl;Kurs;Wert;Einstandskurs", "AAPL;10,5;341,28;3.583,44;191,22", "SAP;4;180,00;720,00;150,5"].join("\n"),
    expect: [["AAPL", 10.5, 191.22], ["SAP", 4, 150.5]],
  },
  {
    name: "Parenthesis negatives and percent columns",
    via: "table",
    text: ["Symbol,Quantity,Last Price,Market Value,Gain/Loss,% Gain,Average Cost", "AAPL,10,$341.28,\"$3,412.80\",\"($120.00)\",(3.4%),$353.28", "MSFT,2,$543.21,\"$1,086.42\",\"$200.00\",22.5%,$443.21"].join("\n"),
    expect: [["AAPL", 10, 353.28], ["MSFT", 2, 443.21]],
  },
  {
    name: "Dashes and n/a for missing cost",
    via: "table",
    text: ["Symbol,Shares,Avg Cost,Price", "AAPL,10,--,341.28", "MSFT,2,n/a,543.21", "VTI,3,,290.10"].join("\n"),
    expect: [["AAPL", 10, null], ["MSFT", 2, null], ["VTI", 3, null]],
  },
  {
    name: "Share classes",
    via: "table",
    text: "Symbol,Quantity\nBRK.B,2\nBRK-B,1\nBF/B,3\nGOOG,1",
    expect: [["BRK.B", 3, null], ["BF.B", 3, null], ["GOOG", 1, null]],
  },
  {
    name: "BOM, CRLF and quoted names with commas",
    via: "table",
    text: '﻿Symbol,Description,Quantity,Average Cost\r\nF,"FORD MOTOR CO, COMMON",100,$11.50\r\nT,"AT&T, INC.",50,$20.00\r\n',
    expect: [["F", 100, 11.5], ["T", 50, 20]],
  },
  {
    name: "Shorthand lines",
    via: "table",
    text: "AAPL 10 @ 150\nmsft 5\nVTI, 25, 210.50\nNVDA 22.056 shares at $73.56",
    expect: [["AAPL", 10, 150], ["MSFT", 5, null], ["VTI", 25, 210.5], ["NVDA", 22.056, 73.56]],
  },
  {
    name: "Headerless rows (any broker, shares × price = value)",
    via: "table",
    text: ["NVDA NVIDIA 22.056 $229.68 $73.56 $5,065.76", "AAPL Apple 12.045 $341.28 $191.22 $4,110.74"].join("\n"),
    expect: [["NVDA", 22.056, 73.56], ["AAPL", 12.045, 191.22]],
  },
  {
    name: "Coinbase portfolio copy (name, then 0.2 BTC)",
    via: "ai",
    text: ["Bitcoin", "$61,000.00", "0.2 BTC", "Ethereum", "$3,000.00", "1.5 ETH"].join("\n"),
    expect: [["BTC", 0.2, null], ["ETH", 1.5, null]],
  },
  {
    name: "SoFi app list (name, ticker, shares, value)",
    via: "ai",
    text: ["Apple", "AAPL", "12.045 shares", "$4,110.74", "Tesla", "TSLA", "11 shares", "$4,139.74"].join("\n"),
    expect: [["AAPL", 12.045, null], ["TSLA", 11, null]],
  },
  { name: "Prose, not holdings", via: "none", text: "Hey! Here is my portfolio, I mostly hold tech stocks and some bonds. Let me know what you think.", expect: [] },
  { name: "Totals only", via: "none", text: "Total value\n$154,180.32\nToday\n+$320.10 (0.21%)", expect: [] },
]
