const aircraftCodeMap: Record<string, string> = {
  "320": "A320",
  "32N": "A321neo",
  "7M9": "737 MAX 9",
  "73W": "737-700",
  "757": "757",
  "772A": "777-200",
  "8EP/8WP": "E175",
};

export function normalizeAircraftType(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  return aircraftCodeMap[code] ?? code;
}
