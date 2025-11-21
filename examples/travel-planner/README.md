# Travel Planner - MCP Multi-Server Example

This example demonstrates the official MCP documentation's "Multi-Server Travel Planning" scenario, implemented using our MCP orchestrator framework. It showcases how three separate servers can work together to provide comprehensive travel planning capabilities.

## Quick Start

### Running the Example

You can run the travel planning example using either `bun` or `ts-node`:

#### Using Bun (Recommended)
```bash
# Install bun if you haven't already
npm install -g bun

# Run the example
bun run examples/travel-planner/example-usage.ts
```

#### Using ts-node
```bash
# Install ts-node if you haven't already  
npm install -g ts-node

# Run the example
ts-node examples/travel-planner/example-usage.ts
```

#### Using Node.js directly
```bash
# First compile the TypeScript files
npx tsc examples/travel-planner/*.ts --outDir examples/travel-planner/dist --module commonjs --target es2020 --esModuleInterop

# Then run the compiled JavaScript
node examples/travel-planner/dist/example-usage.js
```

## Overview

The example implements a personalized AI travel planner with three connected MCP servers:

- **Travel Server**: Handles flights, hotels, and itineraries
- **Weather Server**: Provides climate data and forecasts  
- **Calendar/Email Server**: Manages schedules and communications

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Travel Server  │    │ Weather Server  │    │ Calendar/Email  │
│                 │    │                 │    │     Server      │
│ • searchFlights │    │ • checkWeather  │    │ • getCalendar   │
│ • bookHotel     │    │ • getCurrent    │    │ • createEvent   │
│ • createItin.   │    │ • getAlerts     │    │ • sendEmail     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────┐
                    │ Travel Planner      │
                    │ Orchestrator        │
                    │                     │
                    │ • Multi-server     │
                    │   coordination     │
                    │ • Pattern-based    │
                    │   execution        │
                    │ • Resource gathering│
                    └─────────────────────┘
```

## Complete Flow Implementation

Following the official MCP documentation example, the implementation includes:

### 1. User Invokes Vacation Planning
```typescript
const vacationRequest: VacationRequest = {
  destination: "Barcelona",
  departureDate: "2024-06-15", 
  returnDate: "2024-06-22",
  budget: 3000,
  travelers: 2
};
```

### 2. User Selects Resources  
```typescript
// Calendar resource
calendar://my-calendar/June-2024

// Travel preferences resource  
travel://preferences/europe

// Past trips resource
travel://past-trips/Spain-2023
```

### 3. AI Processes Using Multiple Tools
The orchestrator executes a coordinated workflow:

**Step 1: Gather Context** (from Travel Server)
- `getTravelPreferences()` - Learning preferred airlines and hotel types
- `getPastTrips()` - Discovering previously enjoyed locations

**Step 2: Search & Forecast** (parallel execution)
- `searchFlights()` - Query airlines for NYC to Barcelona flights  
- `checkWeather()` - Retrieve climate forecasts for travel dates

**Step 3: Hotel Booking** (budget-aware filtering)
- `bookHotel()` - Find hotels within specified budget

**Step 4: Calendar Management**
- `getCalendarAvailability()` - Check for schedule conflicts
- `createCalendarEvent()` - Add trip to user's calendar

**Step 5: Communications**
- `sendEmail()` - Send confirmation with trip details
- `scheduleTripReminders()` - Set up trip notifications

## MCP Patterns Used

### Sequential Execution
```typescript
const userContext = await sequence([
  (ctx) => this.gatherUserContext(ctx),
  (ctx) => this.validatePreferences(ctx), 
  (ctx) => this.checkCalendar(ctx)
], initialContext);
```

### Parallel Execution  
```typescript
const [flights, weather] = await Promise.all([
  this.searchFlights(request, preferences),
  this.getWeatherForecast(request)
]);
```

### Retry Logic
```typescript
const flights = await retry(
  () => this.orchestrator.callTool('searchFlights', searchParams),
  {
    maxAttempts: 3,
    backoff: 'linear',
    retryIf: (error) => error.message.includes('timeout')
  }
);
```

### Conditional Execution
```typescript
const hotels = await conditional({
  condition: () => budget > minHotelBudget,
  then: () => this.findBudgetHotels(request),
  else: () => this.findHostelOptions(request)
});
```

## Server Implementations

### Travel Server (`servers/travel-server.ts`)
- **Tools**: searchFlights, bookHotel, getTravelPreferences, getPastTrips, createItinerary
- **Data**: Mock flights, hotels, user preferences, travel history
- **Features**: Preference-based filtering, budget-aware results

### Weather Server (`servers/weather-server.ts`)  
- **Tools**: checkWeather, getCurrentWeather, getWeatherAlerts, getPackingRecommendations
- **Data**: Mock weather forecasts, temperature data, conditions
- **Features**: Intelligent packing suggestions, weather alerts

### Calendar/Email Server (`servers/calendar-server.ts`)
- **Tools**: getCalendarAvailability, createCalendarEvent, sendEmail, scheduleTripReminders
- **Data**: Mock calendar events, email accounts
- **Features**: Conflict detection, reminder scheduling, email automation

## Key Features

### Multi-Server Coordination
The orchestrator seamlessly coordinates between three independent servers, each with their own tool set and data sources.

### Pattern-Based Execution
Uses orchestration patterns (sequence, parallel, retry, conditional) to create robust, fault-tolerant workflows.

### Resource Integration
Automatically accesses user resources across servers:
- Personal preferences from Travel Server
- Calendar availability from Calendar Server  
- Historical data from past trips

### Intelligent Recommendations
Combines data from all sources to provide:
- Weather-based packing advice
- Budget optimization suggestions  
- Past trip-based recommendations
- Preference-aware filtering

### Automated Follow-up
Completes the workflow with:
- Calendar event creation
- Trip reminders scheduling
- Email confirmations

## Expected Output

```
🚀 Starting MCP Travel Planner Demo

Connecting to MCP servers...
Available tools:
- travel:searchFlights
- travel:bookHotel  
- travel:getTravelPreferences
- travel:getPastTrips
- weather:checkWeather
- weather:getCurrentWeather
- calendar:getCalendarAvailability
- calendar:createCalendarEvent
- calendar:sendEmail

=== Planning Vacation to Barcelona ===

Gathering user context...
Found preferences: 2 airlines, 2 hotel types
Found 3 past trips

Searching for flights...
Found 3 flight options
Getting weather forecast...  
Weather forecast: 8 days of data
Average temperature: 25°C
Finding suitable hotels...
Found 3 hotels within budget
Checking calendar availability...
Calendar availability: Available
Generating recommendations...
Creating comprehensive itinerary...
Finalizing booking...
Calendar events scheduled and confirmation email sent

🎯 COMPLETE TRAVEL PLAN RESULTS

✈️  AVAILABLE FLIGHTS:
   1. Iberia - $850 (8h 30m)
   2. American Airlines - $920 (9h 15m)  
   3. Vueling - $780 (9h 15m)

🏨 SUITABLE HOTELS:
   1. Hotel Barcelona Plaza - $1050 (4.2⭐)
   2. Casa Gracia - $1260 (4.5⭐)
   3. Hostel Barcelona - $315 (3.8⭐)

🌤️  WEATHER FORECAST:
   2024-06-15: 24°C, sunny
   2024-06-16: 26°C, partly_cloudy
   2024-06-17: 22°C, cloudy

💡 RECOMMENDATIONS:
   1. Pack light, breathable clothing for warm weather
   2. Barcelona has excellent vegetarian restaurants in the Gothic Quarter

📋 NEXT STEPS:
   1. Review flight options and select preferred flights
   2. Choose hotel based on preferences and budget
   3. Confirm booking after reviewing all details
   4. Check weather forecast before departure
   5. Add trip to calendar and set reminders

💰 ESTIMATED TOTAL COST: $1165
💳 BOOKING CONFIRMATION: ITIN-1703123456789
📅 TRIP DURATION: 7 days

📅 CALENDAR EVENTS:
   ✅ Outbound flight added to calendar
   ✅ Return flight added to calendar  
   ✅ Trip reminders scheduled (7, 3, 1 days before)

📧 EMAIL CONFIRMATION:
   ✅ Confirmation email sent to user@gmail.com
   ✅ Subject: Trip Confirmation: Barcelona

🎉 TRAVEL PLANNING COMPLETE!
```

## Implementation Highlights

### Mock Data Realism
Each server includes realistic mock data:
- Realistic flight times, prices, and airline information
- Actual weather conditions and temperature ranges
- Plausible hotel names, ratings, and amenities
- Calendar conflicts and email account details

### Error Handling
Robust error handling throughout:
- Retry logic for flaky network requests
- Graceful degradation when services are unavailable
- User-friendly error messages and fallback options

### Type Safety
Full TypeScript implementation with:
- Shared type definitions across servers
- Runtime validation using Zod schemas  
- Type-safe tool calls and responses

### Scalability Design
The architecture supports:
- Easy addition of new servers
- Independent scaling of different services
- Plugin-based tool discovery
- Hot-swappable server configurations

## Benefits Demonstrated

This example shows how MCP enables:

✅ **Service Integration**: Multiple independent servers working as one coordinated system
✅ **Resource Sharing**: Seamless access to user data across different services  
✅ **Complex Workflows**: Orchestration patterns making complex business logic manageable
✅ **Real-time Coordination**: Parallel execution of independent operations
✅ **Fault Tolerance**: Built-in retry and error handling patterns
✅ **User Experience**: Complete end-to-end workflows with minimal user input

## Dependencies

The example requires the following dependencies:

```json
{
  "@modelcontextprotocol/sdk": "^0.6.0",
  "zod": "^3.22.0",
  "typescript": "^5.0.0"
}
```

## Troubleshooting

### Common Issues

**Module Resolution Errors**
- Ensure you're running from the project root directory
- Use `bun run` or `ts-node` from the examples directory

**Type Compilation Errors**
- The example uses TypeScript - run with `bun` or `ts-node` for proper type checking
- For Node.js, compile first with `npx tsc`

**MCP Server Connection Issues**
- The example uses mock data, so no external API keys are required
- Ensure all server files are in the correct `servers/` directory

## Next Steps

The framework enables easy extension with:
- Real API integrations (replace mock data)
- Additional servers (rental cars, activities, etc.)
- Advanced AI reasoning and natural language processing
- User authentication and multi-tenant support
- Payment processing and booking confirmations

This example demonstrates the power of MCP for building sophisticated, multi-service applications through simple, composable tools.