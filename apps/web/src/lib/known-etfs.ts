/**
 * Well-known US ETFs, so a holding is shown as an ETF from the first page load
 * rather than "a stock" until the provider's ticker details have been fetched.
 *
 * Every security starts out stored as "equity", and only a provider lookup
 * corrects it (one ticker per scheduled run). Until that has happened for a
 * ticker, this list stands in. It is a fallback only: once the provider has
 * answered, its verdict always wins, so a wrong entry here can't stick.
 *
 * Plain data and no imports, so the tests can run it directly.
 */
export const KNOWN_ETFS: ReadonlySet<string> = new Set(
  (
    "SPY IVV VOO VTI QQQ QQQM SPLG ITOT SCHB SCHX RSP DIA IWM IWB IWR MDY IJH IJR VB VO VV " +
    "VUG VTV VGT VYM VIG VT VNQ VFH VDE VHT VIS VOX VPU VAW VCR VDC SCHG SCHV SCHA SCHD " +
    "IVW IVE IWF IWD IWP IWS IWN IWO SPYG SPYV MTUM QUAL USMV VLUE SDY NOBL DVY DGRO JEPI JEPQ " +
    "VEA VWO VXUS VSS VGK VPL IEFA IEMG IXUS EFA EEM SCHF IDEV " +
    "AVUV AVDV AVUS DFAC DFAT " +
    "XLK XLF XLE XLV XLY XLP XLI XLU XLB XLRE XLC SMH SOXX XBI IBB IGV CLOU SKYY KRE KBE " +
    "ARKK ARKW ARKG ARKF BOTZ ICLN TAN LIT URA COPX GDX GDXJ " +
    "BND BNDX AGG LQD HYG TLT IEF SHY TIP VCIT VCSH VGSH VGIT BIV BSV MUB SGOV BIL SHV " +
    "GLD IAU SLV USO UNG " +
    "TBT TMF TQQQ SQQQ SOXL SOXS UPRO SPXU SPXL TZA TNA FAS FNGU " +
    "BITO IBIT FBTC ETHA"
  ).split(" "),
)

/**
 * The type to show for a holding. A provider-confirmed type is never overridden;
 * only a security the provider hasn't been asked about yet falls back to the list.
 */
export function effectiveSecurityType(type: string | null, ticker: string | null, providerChecked: boolean): string | null {
  if (type === "equity" && !providerChecked && ticker && KNOWN_ETFS.has(ticker.toUpperCase())) return "etf"
  return type
}
