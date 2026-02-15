import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerWeatherTools(server: McpServer): void {
  server.registerTool(
    "get_weather",
    {
      description: "Get the current weather for a location using live data from WeatherAPI.com.",
      inputSchema: {
        location: z.string().describe("City or location name, e.g. 'London'"),
        unit: z
          .enum(["C", "F"])
          .describe("Temperature unit, either 'C' or 'F'"),
      },
    },
    async ({ location, unit = "C" }) => {
      const response = await fetch(
        `https://api.weatherapi.com/v1/current.json?q=${encodeURIComponent(location)}&key=${process.env.WEATHER_API_KEY}`,
      );

      if (!response.ok) {
        return {
          content: [{ type: "text" as const, text: `Failed to fetch weather for "${location}" (HTTP ${response.status})` }],
        };
      }

      const data = await response.json();
      const current = data.current;
      const loc = data.location;

      const weatherData = {
        location: { name: loc.name, region: loc.region, country: loc.country },
        temperature: { c: current.temp_c, f: current.temp_f, feels_like_c: current.feelslike_c, feels_like_f: current.feelslike_f },
        unit,
        condition: current.condition.text,
        wind: { kph: current.wind_kph, mph: current.wind_mph, direction: current.wind_dir },
        humidity: current.humidity,
        uv: current.uv,
        visibility_km: current.vis_km,
        last_updated: current.last_updated,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(weatherData),
          },
        ],
      };
    },
  );
}
