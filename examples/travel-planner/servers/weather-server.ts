import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WeatherInfo } from "../types/index.js";

// Mock weather data for demonstration
const mockWeatherData: Record<string, WeatherInfo[]> = {
  "Barcelona": [
    {
      destination: "Barcelona",
      date: "2024-06-15",
      temperature: 24,
      condition: "sunny",
      humidity: 65,
      description: "Clear skies with plenty of sunshine"
    },
    {
      destination: "Barcelona", 
      date: "2024-06-16",
      temperature: 26,
      condition: "partly_cloudy",
      humidity: 62,
      description: "Partly cloudy with warm temperatures"
    },
    {
      destination: "Barcelona",
      date: "2024-06-17", 
      temperature: 22,
      condition: "cloudy",
      humidity: 70,
      description: "Overcast with mild temperatures"
    },
    {
      destination: "Barcelona",
      date: "2024-06-18",
      temperature: 25,
      condition: "sunny", 
      humidity: 58,
      description: "Bright and sunny day"
    },
    {
      destination: "Barcelona",
      date: "2024-06-19",
      temperature: 27,
      condition: "sunny",
      humidity: 55,
      description: "Hot and sunny weather"
    },
    {
      destination: "Barcelona",
      date: "2024-06-20",
      temperature: 23,
      condition: "partly_cloudy",
      humidity: 68,
      description: "Mild with some cloud cover"
    },
    {
      destination: "Barcelona",
      date: "2024-06-21",
      temperature: 26,
      condition: "sunny",
      humidity: 60,
      description: "Perfect beach weather"
    },
    {
      destination: "Barcelona",
      date: "2024-06-22",
      temperature: 28,
      condition: "sunny",
      humidity: 52,
      description: "Hot and clear skies"
    }
  ],
  "London": [
    {
      destination: "London",
      date: "2024-06-15",
      temperature: 18,
      condition: "rainy",
      humidity: 80,
      description: "Light rain throughout the day"
    },
    {
      destination: "London",
      date: "2024-06-16", 
      temperature: 20,
      condition: "cloudy",
      humidity: 75,
      description: "Overcast but dry"
    }
  ],
  "Paris": [
    {
      destination: "Paris",
      date: "2024-06-15",
      temperature: 22,
      condition: "partly_cloudy",
      humidity: 70,
      description: "Mild with scattered clouds"
    }
  ]
};

// Create the server
const server = new Server(
  {
    name: "weather-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "checkWeather",
        description: "Get weather forecast for a destination and date range",
        inputSchema: {
          type: "object",
          properties: {
            destination: { type: "string", description: "Destination city" },
            startDate: { type: "string", description: "Start date (ISO format)" },
            endDate: { type: "string", description: "End date (ISO format)" }
          },
          required: ["destination", "startDate", "endDate"]
        }
      },
      {
        name: "getCurrentWeather",
        description: "Get current weather for a destination",
        inputSchema: {
          type: "object",
          properties: {
            destination: { type: "string", description: "Destination city" }
          },
          required: ["destination"]
        }
      },
      {
        name: "getWeatherAlerts",
        description: "Get weather alerts and warnings for a destination",
        inputSchema: {
          type: "object",
          properties: {
            destination: { type: "string", description: "Destination city" }
          },
          required: ["destination"]
        }
      },
      {
        name: "getPackingRecommendations",
        description: "Get packing recommendations based on weather forecast",
        inputSchema: {
          type: "object",
          properties: {
            destination: { type: "string", description: "Destination city" },
            dates: { type: "array", description: "Array of date strings" }
          },
          required: ["destination", "dates"]
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "checkWeather":
        return await checkWeather(args);
      case "getCurrentWeather":
        return await getCurrentWeather(args);
      case "getWeatherAlerts":
        return await getWeatherAlerts(args);
      case "getPackingRecommendations":
        return await getPackingRecommendations(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error.message })
        }
      ]
    };
  }
});

async function checkWeather(args: any) {
  const { destination, startDate, endDate } = args;
  
  const weatherData = mockWeatherData[destination];
  if (!weatherData) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `No weather data available for ${destination}`,
            availableDestinations: Object.keys(mockWeatherData)
          })
        }
      ]
    };
  }

  // Filter weather data for the requested date range
  const filteredWeather = weatherData.filter(weather => {
    const weatherDate = new Date(weather.date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return weatherDate >= start && weatherDate <= end;
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          destination,
          forecast: filteredWeather,
          summary: {
            dateRange: `${startDate} to ${endDate}`,
            totalDays: filteredWeather.length,
            avgTemperature: Math.round(filteredWeather.reduce((sum, w) => sum + w.temperature, 0) / filteredWeather.length),
            conditions: [...new Set(filteredWeather.map(w => w.condition))]
          }
        })
      }
    ]
  };
}

async function getCurrentWeather(args: any) {
  const { destination } = args;
  
  const weatherData = mockWeatherData[destination];
  if (!weatherData || weatherData.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `No current weather data available for ${destination}`,
            availableDestinations: Object.keys(mockWeatherData)
          })
        }
      ]
    };
  }

  // Return today's weather (first entry)
  const currentWeather = weatherData[0];

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          destination,
          current: currentWeather,
          lastUpdated: new Date().toISOString()
        })
      }
    ]
  };
}

async function getWeatherAlerts(args: any) {
  const { destination } = args;
  
  // Mock weather alerts - in a real system, this would come from weather services
  const alerts = [];
  
  // Simulate some alerts for certain conditions
  if (destination === "Barcelona") {
    alerts.push({
      type: "heat_advisory",
      severity: "moderate",
      message: "High temperatures expected - stay hydrated and avoid midday sun",
      startDate: "2024-06-19",
      endDate: "2024-06-22"
    });
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          destination,
          alerts,
          alertCount: alerts.length,
          hasActiveAlerts: alerts.length > 0
        })
      }
    ]
  };
}

async function getPackingRecommendations(args: any) {
  const { destination, dates } = args;
  
  const weatherData = mockWeatherData[destination];
  if (!weatherData) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `No packing recommendations available for ${destination}`
          })
        }
      ]
    };
  }

  // Get weather for the requested dates
  const relevantWeather = weatherData.filter(weather => 
    dates.includes(weather.date)
  );

  // Generate packing recommendations based on conditions
  const recommendations = {
    essential: ["passport", "comfortable walking shoes", "phone charger"],
    clothing: [] as string[],
    weather_specific: [] as string[],
    optional: [] as string[]
  };

  // Analyze conditions and provide recommendations
  const hasSunny = relevantWeather.some(w => w.condition === "sunny");
  const hasRain = relevantWeather.some(w => w.condition === "rainy");
  const hasHot = relevantWeather.some(w => w.temperature > 25);
  const hasCold = relevantWeather.some(w => w.temperature < 20);

  if (hasSunny) {
    recommendations.clothing.push("light clothes", "sunglasses", "sun hat");
    recommendations.weather_specific.push("sunscreen (SPF 30+)");
  }

  if (hasHot) {
    recommendations.clothing.push("breathable fabrics", "light-colored clothing");
    recommendations.weather_specific.push("water bottle");
  }

  if (hasRain) {
    recommendations.weather_specific.push("umbrella", "waterproof jacket");
  }

  if (hasCold) {
    recommendations.clothing.push("light jacket", "long sleeves");
  }

  recommendations.optional = ["camera", "travel guide", "snacks"];

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          destination,
          packingList: recommendations,
          weatherSummary: {
            avgTemp: Math.round(relevantWeather.reduce((sum, w) => sum + w.temperature, 0) / relevantWeather.length),
            conditions: [...new Set(relevantWeather.map(w => w.condition))],
            recommendationBasis: `${dates.length} days of forecast data`
          }
        })
      }
    ]
  };
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather Server started");
}

if (require.main === module) {
  main();
}

export { server };