/** English / Bengali / slug fragments → DSE symbol (longest match wins). */
export const TICKER_ALIAS_ENTRIES: Array<{ symbol: string; needles: string[] }> = [
  {
    symbol: 'BXPHARMA',
    needles: ['beximco pharma', 'beximco-pharma', 'beximco pharmas', 'বেক্সিমকো ফার্মা', 'বেক্সিমকো'],
  },
  { symbol: 'GP', needles: ['grameenphone', 'গ্রামীণফোন', 'গ্রামীনফোন', 'গ্রামীণ ফোন'] },
  { symbol: 'SQURPHARMA', needles: ['square pharma', 'square pharmaceuticals', 'স্কয়ার ফার্মা', 'স্কয়ার ফার্মাসিউটিক্যালস'] },
  { symbol: 'SQUARETEXT', needles: ['square textile', 'square textiles', 'স্কয়ার টেক্সটাইল'] },
  { symbol: 'SQURPHARMA', needles: ['square'] },
  { symbol: 'LHB', needles: ['lafargeholcim', 'lafarge holcim', 'lafarge', 'লাফার্জহলসিম', 'লাফার্জ'] },
  { symbol: 'BRACBANK', needles: ['brac bank', 'ব্র্যাক ব্যাংক', 'ব্র্যাক'] },
  { symbol: 'BATBC', needles: ['british american tobacco', 'ব্রিটিশ আমেরিকান টোবাকো'] },
  { symbol: 'CITYBANK', needles: ['city bank', 'সিটি ব্যাংক'] },
  { symbol: 'ROBI', needles: ['robi axiata', 'রবি এক্সিয়াটা', 'রবি'] },
  { symbol: 'RENATA', needles: ['renata', 'রেনাটা'] },
  { symbol: 'OLYMPIC', needles: ['olympic industries', 'অলিম্পিক'] },
  { symbol: 'BERGERPBL', needles: ['berger paints', 'বার্জার'] },
  { symbol: 'MARICO', needles: ['marico', 'ম্যারিকো'] },
  { symbol: 'UPGDCL', needles: ['upgdcl', 'ইউপিজিডিসিএল'] },
  { symbol: 'POWERGRID', needles: ['power grid', 'পাওয়ার গ্রিড'] },
  { symbol: 'EBL', needles: ['eastern bank', 'ইস্টার্ন ব্যাংক'] },
  { symbol: 'ACI', needles: ['advanced chemical', 'advanced chemical industries', 'এডভান্সড কেমিক্যাল', 'এসিআই'] },
  { symbol: 'BEACONPHAR', needles: ['beacon pharma', 'beacon pharmaceutical', 'বিকন ফার্মা', 'বিকন'] },
  { symbol: 'CONFIDCEM', needles: ['confidence cement', 'কনফিডেন্স সিমেন্ট'] },
  { symbol: 'HEIDELBCEM', needles: ['heidelberg cement', 'হাইডেলবার্গ'] },
  { symbol: 'IBNSINA', needles: ['ibn sina', 'ibnsina', 'ইবনে সিনা'] },
  { symbol: 'IDLC', needles: ['idlc finance', 'idlc', 'আইডিএলসি'] },
  { symbol: 'IFIC', needles: ['ific bank', 'আইএফআইসি'] },
  { symbol: 'MTB', needles: ['mutual trust bank', 'মিউচুয়াল ট্রাস্ট'] },
  { symbol: 'PRAGATILIF', needles: ['pragati life', 'প্রগতি লাইফ'] },
  { symbol: 'RECKITTBEN', needles: ['reckitt', 'রেকিট'] },
  { symbol: 'UNILEVERCL', needles: ['unilever', 'ইউনিলিভার'] },
  { symbol: 'WALTONHIL', needles: ['walton hi-tech', 'walton hitech', 'walton', 'ওয়ালটন'] },
  { symbol: 'BSCCL', needles: ['bsccl'] },
  { symbol: 'NHFIL', needles: ['national housing finance', 'national housing', 'ন্যাশনাল হাউজিং'] },
  { symbol: 'PEOPLESINS', needles: ['peoples insurance', "people's insurance", 'peoples ins', 'পিপলস ইন্স্যুরেন্স', 'পিপলস'] },
  { symbol: 'ISLAMIINS', needles: ['islami insurance', 'islamic insurance', 'ইসলামী ইন্স্যুরেন্স', 'ইসলামি ইন্স্যুরেন্স'] },
  { symbol: 'IPDC', needles: ['ipdc finance', 'ipdc', 'আইপিডিসি'] },
  { symbol: 'DSEX', needles: ['dsex', 'dse x'] },
  { symbol: 'PUBALIBANK', needles: ['pubali bank', 'পূবালী ব্যাংক', 'পubali bank'] },
  { symbol: 'PRIMEBANK', needles: ['prime bank'] },
  { symbol: 'MIDLANDBNK', needles: ['midland bank'] },
  { symbol: 'BSRMSTEEL', needles: ['bsrm', 'bsrm steel'] },
  { symbol: 'GP', needles: ['gp ltd', 'gp declares'] },
];

/** Short Bengali label for dashboard display (symbol → বাংলা). */
export const TICKER_BN_LABELS: Record<string, string> = {
  BXPHARMA: 'বেক্সিমকো',
  GP: 'গ্রামীণফোন',
  SQURPHARMA: 'স্কয়ার ফার্মা',
  LHB: 'লাফার্জ',
  BRACBANK: 'ব্র্যাক ব্যাংক',
  ROBI: 'রবি',
  ACI: 'এসিআই',
  WALTONHIL: 'ওয়ালটন',
  NHFIL: 'ন্যাশনাল হাউজিং',
  PEOPLESINS: 'পিপলস ইন্স্যুরেন্স',
  ISLAMIINS: 'ইসলামী ইন্স্যুরেন্স',
  IPDC: 'আইপিডিসি',
};

/** Flat list sorted longest needle first to prefer specific matches. */
export function sortedAliasNeedles(): Array<{ needle: string; symbol: string }> {
  const flat: Array<{ needle: string; symbol: string }> = [];
  for (const entry of TICKER_ALIAS_ENTRIES) {
    for (const needle of entry.needles) {
      flat.push({ needle, symbol: entry.symbol });
    }
  }
  flat.sort((a, b) => b.needle.length - a.needle.length);
  return flat;
}
