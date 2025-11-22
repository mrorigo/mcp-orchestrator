import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { Flight, Hotel, TravelPreferences, PastTrip } from "../types/index.js";

// Mock data for demonstration
const mockFlights: Flight[] = [
  {
    id: "FL001",
    airline: "Iberia",
    from: "NYC",
    to: "Barcelona",
    departureTime: "2024-06-15T08:00:00Z",
    arrivalTime: "2024-06-15T20:30:00Z",
    price: 850,
    duration: "8h 30m"
  },
  {
    id: "FL002",
    airline: "American Airlines",
    from: "NYC",
    to: "Barcelona",
    departureTime: "2024-06-15T14:00:00Z",
    arrivalTime: "2024-06-16T02:15:00Z",
    price: 920,
    duration: "9h 15m"
  },
  {
    id: "FL003",
    airline: "Vueling",
    from: "NYC",
    to: "Barcelona",
    departureTime: "2024-06-15T10:30:00Z",
    arrivalTime: "2024-06-15T22:45:00Z",
    price: 780,
    duration: "9h 15m"
  }
];

const mockHotels: Hotel[] = [
  {
    id: "HT001",
    name: "Hotel Barcelona Plaza",
    location: "Barcelona City Center",
    checkIn: "2024-06-15",
    checkOut: "2024-06-22",
    pricePerNight: 150,
    totalPrice: 1050,
    rating: 4.2,
    amenities: ["WiFi", "Pool", "Gym", "Restaurant"]
  },
  {
    id: "HT002",
    name: "Casa Gracia",
    location: "Barcelona Gothic Quarter",
    checkIn: "2024-06-15",
    checkOut: "2024-06-22",
    pricePerNight: 180,
    totalPrice: 1260,
    rating: 4.5,
    amenities: ["WiFi", "Terrace", "Kitchen", "Pet Friendly"]
  },
  {
    id: "HT003",
    name: "Hostel Barcelona",
    location: "Barcelona Beach",
    checkIn: "2024-06-15",
    checkOut: "2024-06-22",
    pricePerNight: 45,
    totalPrice: 315,
    rating: 3.8,
    amenities: ["WiFi", "Shared Kitchen", "Laundry"]
  }
];

const mockPreferences: TravelPreferences = {
  preferredAirlines: ["Iberia", "American Airlines"],
  hotelTypes: ["Boutique", "City Center"],
  preferredSeating: "window",
  dietaryRestrictions: ["vegetarian"]
};

const mockPastTrips: PastTrip[] = [
  {
    id: "PT001",
    destination: "Spain",
    year: 2023,
    rating: 4.5,
    highlights: ["Sagrada Familia", "Park Güell", "Gothic Quarter", "Tapas tours"]
  },
  {
    id: "PT002",
    destination: "Italy",
    year: 2023,
    rating: 4.8,
    highlights: ["Rome Colosseum", "Venice canals", "Tuscany wine tours"]
  },
  {
    id: "PT003",
    destination: "France",
    year: 2022,
    rating: 4.3,
    highlights: ["Eiffel Tower", "Louvre Museum", "Seine cruise"]
  }
];

// Create the server
const server = new Server(
  {
    name: "travel-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      sampling: {}, // Declare sampling capability
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "searchFlights",
        description: "Search for flights between two cities",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "Departure city" },
            to: { type: "string", description: "Destination city" },
            date: { type: "string", description: "Departure date (ISO format)" },
            returnDate: { type: "string", description: "Return date (ISO format)" },
            travelers: { type: "number", description: "Number of travelers" }
          },
          required: ["from", "to", "date", "travelers"]
        }
      },
      {
        name: "analyzeFlights",
        description: "Analyze flight options using LLM to find the best value",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "Departure city" },
            to: { type: "string", description: "Destination city" },
            criteria: { type: "string", description: "Specific criteria (e.g., cheapest, fastest, best value)" }
          },
          required: ["from", "to", "criteria"]
        }
      },
      {
        name: "bookHotel",
        description: "Find and book hotels within budget",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string", description: "Hotel location" },
            checkIn: { type: "string", description: "Check-in date" },
            checkOut: { type: "string", description: "Check-out date" },
            budget: { type: "number", description: "Total budget for hotel" },
            travelers: { type: "number", description: "Number of travelers" }
          },
          required: ["location", "checkIn", "checkOut", "budget"]
        }
      },
      {
        name: "getTravelPreferences",
        description: "Get user's travel preferences",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "getPastTrips",
        description: "Get user's past travel history",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "createItinerary",
        description: "Create a complete travel itinerary",
        inputSchema: {
          type: "object",
          properties: {
            destination: { type: "string", description: "Destination city" },
            flights: { type: "array", description: "Selected flights" },
            hotels: { type: "array", description: "Selected hotels" },
            activities: { type: "array", description: "Planned activities" }
          },
          required: ["destination", "flights", "hotels"]
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
      case "searchFlights":
        return await searchFlights(args);
      case "analyzeFlights":
        return await analyzeFlights(args);
      case "bookHotel":
        return await bookHotel(args);
      case "getTravelPreferences":
        return await getTravelPreferences();
      case "getPastTrips":
        return await getPastTrips();
      case "createItinerary":
        return await createItinerary(args);
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
      ],
      isError: true
    };
  }
});

async function searchFlights(args: any) {
  const { from, to, date, returnDate, travelers } = args;

  // Filter flights based on criteria (simplified mock logic)
  let flights = mockFlights.filter(flight =>
    flight.from.toLowerCase().includes(from.toLowerCase()) &&
    flight.to.toLowerCase().includes(to.toLowerCase())
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          flights: flights,
          searchCriteria: { from, to, date, returnDate, travelers },
          totalResults: flights.length
        })
      }
    ]
  };
}

async function analyzeFlights(args: any) {
  const { from, to, criteria } = args;

  // 1. Get flights
  const flights = mockFlights.filter(flight =>
    flight.from.toLowerCase().includes(from.toLowerCase()) &&
    flight.to.toLowerCase().includes(to.toLowerCase())
  );

  if (flights.length === 0) {
    return {
      content: [{ type: "text", text: "No flights found to analyze." }]
    };
  }

  // 2. Use Sampling to ask LLM to analyze
  try {
    const result = await server.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please analyze these flights based on the following criteria: "${criteria}".
            
            Flights Data:
            ${JSON.stringify(flights, null, 2)}
            
            Provide a recommendation for the best flight.`
          }
        }
      ],
      systemPrompt: "You are a travel expert assistant. Analyze flight options and give concise recommendations.",
      maxTokens: 300,
      modelPreferences: {
        hints: ["gpt-4o-mini", "claude-3-haiku"]
      }
    });

    return {
      content: [
        {
          type: "text",
          text: result.content.type === 'text' ? result.content.text : "Analysis completed but content format unexpected."
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to analyze flights using sampling: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

async function bookHotel(args: any) {
  const { location, checkIn, checkOut, budget, travelers } = args;

  // Filter hotels based on budget
  const hotels = mockHotels.filter(hotel => hotel.totalPrice <= budget);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          hotels: hotels,
          searchCriteria: { location, checkIn, checkOut, budget, travelers },
          availableCount: hotels.length
        })
      }
    ]
  };
}

async function getTravelPreferences() {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(mockPreferences)
      }
    ]
  };
}

async function getPastTrips() {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          trips: mockPastTrips,
          totalTrips: mockPastTrips.length
        })
      }
    ]
  };
}

async function createItinerary(args: any) {
  const { destination, flights, hotels, activities = [] } = args;

  const itinerary = {
    destination,
    flights,
    hotels,
    activities,
    createdAt: new Date().toISOString(),
    totalCost: flights.reduce((sum: number, flight: Flight) => sum + flight.price, 0) +
      hotels.reduce((sum: number, hotel: Hotel) => sum + hotel.totalPrice, 0)
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          itinerary,
          status: "created",
          confirmationCode: `ITIN-${Date.now()}`
        })
      }
    ]
  };
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Travel Server started");
}

if (require.main === module) {
  main();
}

export { server };