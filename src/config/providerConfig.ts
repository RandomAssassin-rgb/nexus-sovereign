export type ProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  enabled: boolean;
  label: string;
};

export const providerConfig = {
  weather: {
    baseUrl: process.env.WEATHER_BASE_URL,
    apiKey: process.env.WEATHER_API_KEY,
    enabled: Boolean(process.env.WEATHER_BASE_URL),
    label: "Weather Provider",
  },
  aqi: {
    baseUrl: process.env.AQI_BASE_URL,
    apiKey: process.env.AQI_API_KEY,
    enabled: Boolean(process.env.AQI_BASE_URL),
    label: "AQI Provider",
  },
  traffic: {
    baseUrl: process.env.TRAFFIC_BASE_URL,
    apiKey: process.env.TRAFFIC_API_KEY,
    enabled: Boolean(process.env.TRAFFIC_BASE_URL),
    label: "Traffic Provider",
  },
} satisfies Record<string, ProviderConfig>;
