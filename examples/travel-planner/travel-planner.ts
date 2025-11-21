import { MCPOrchestrator } from '../../src/index.js';
import { OpenAIProvider } from '../../src/llm/index.js';
import { sequence, conditional, retry } from '../../src/patterns/index.js';
import { z } from 'zod';
import {
  VacationRequest,
  Flight,
  Hotel,
  WeatherInfo,
  TravelPreferences,
  PastTrip,
  TravelItinerary,
  BookingConfirmation
} from './types/index.js';

// Schema for travel planning result
const TravelPlanningSchema = z.object({
  destination: z.string(),
  departureDate: z.string(),
  returnDate: z.string(),
  budget: z.number(),
  travelers: z.number(),
  availableFlights: z.array(z.any()),
  suitableHotels: z.array(z.any()),
  weatherForecast: z.array(z.any()),
  recommendedItinerary: z.any(),
  totalEstimatedCost: z.number(),
  recommendations: z.array(z.string()),
  nextSteps: z.array(z.string())
});

export class TravelPlanner {
  private orchestrator: MCPOrchestrator;

  constructor() {
    this.orchestrator = new MCPOrchestrator({
      servers: {
        travel: {
          command: 'bun',
          args: ['./servers/travel-server.ts']
        },
        weather: {
          command: 'bun', 
          args: ['./servers/weather-server.ts']
        },
        calendar: {
          command: 'bun',
          args: ['./servers/calendar-server.ts']
        }
      },
      llm: new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
      }),
      connectionOptions: {
        autoConnect: false
      }
    });
  }

  async initialize(): Promise<void> {
    console.log('Connecting to MCP servers...');
    await this.orchestrator.connect();
    console.log('Available tools:');
    this.orchestrator.tools.list().forEach(tool => 
      console.log(`- ${tool.serverName}:${tool.name}`)
    );
  }

  async disconnect(): Promise<void> {
    await this.orchestrator.disconnect();
  }

  /**
   * Execute the complete travel planning workflow
   * This follows the official MCP documentation example:
   * 1. Gather user context (preferences, past trips, calendar availability)
   * 2. Search for flights and check weather in parallel
   * 3. Filter hotels based on budget and preferences
   * 4. Create comprehensive itinerary
   * 5. Schedule calendar events and send notifications
   */
  async planVacation(request: VacationRequest): Promise<z.infer<typeof TravelPlanningSchema>> {
    console.log(`\n=== Planning Vacation to ${request.destination} ===`);
    
    // Step 1: Gather user context from multiple servers
    const userContext = await this.gatherUserContext();
    
    // Step 2: Search for flights and weather in parallel
    const [flightsResult, weatherResult] = await this.parallelSearch(request, userContext);

    // Step 3: Find suitable hotels based on budget and preferences
    const hotelsResult = await this.findHotels(request, userContext.preferences);

    // Step 4: Check calendar availability
    const calendarAvailability = await this.checkCalendarAvailability(request);

    // Step 5: Create comprehensive recommendations
    const recommendations = await this.generateRecommendations(
      request,
      flightsResult,
      hotelsResult,
      weatherResult,
      userContext
    );

    // Step 6: Create the travel itinerary
    const itinerary = await this.createItinerary(
      request,
      flightsResult,
      hotelsResult,
      weatherResult,
      calendarAvailability
    );

    // Step 7: Schedule calendar events and send confirmation
    await this.finalizeBooking(request, itinerary);

    return {
      ...request,
      availableFlights: flightsResult,
      suitableHotels: hotelsResult,
      weatherForecast: weatherResult,
      recommendedItinerary: itinerary,
      totalEstimatedCost: this.calculateTotalCost(flightsResult, hotelsResult),
      recommendations,
      nextSteps: [
        'Review flight options and select preferred flights',
        'Choose hotel based on preferences and budget',
        'Confirm booking after reviewing all details',
        'Check weather forecast before departure',
        'Add trip to calendar and set reminders'
      ]
    };
  }

  private async parallelSearch(request: VacationRequest, userContext: { preferences: TravelPreferences; pastTrips: PastTrip[] }): Promise<[Flight[], WeatherInfo[]]> {
    const [flights, weather] = await Promise.all([
      this.searchFlights(request, userContext.preferences),
      this.getWeatherForecast(request)
    ]);
    return [flights, weather];
  }

  private async gatherUserContext(): Promise<{
    preferences: TravelPreferences;
    pastTrips: PastTrip[];
  }> {
    console.log('Gathering user context...');

    const [preferencesResult, pastTripsResult] = await Promise.all([
      this.orchestrator.callTool('getTravelPreferences', {}),
      this.orchestrator.callTool('getPastTrips', {})
    ]);

    const preferences = JSON.parse(preferencesResult.content[0].text);
    const pastTrips = JSON.parse(pastTripsResult.content[0].text);

    console.log(`Found preferences: ${preferences.preferredAirlines.length} airlines, ${preferences.hotelTypes.length} hotel types`);
    console.log(`Found ${pastTrips.totalTrips} past trips`);

    return { preferences, pastTrips: pastTrips.trips };
  }

  private async searchFlights(request: VacationRequest, preferences: TravelPreferences): Promise<Flight[]> {
    console.log('Searching for flights...');
    
    const result = await retry(
      () => this.orchestrator.callTool('searchFlights', {
        from: 'NYC',
        to: request.destination,
        date: request.departureDate,
        returnDate: request.returnDate,
        travelers: request.travelers
      }),
      {
        maxAttempts: 3,
        backoff: 'linear',
        retryIf: (error: any) => error.message.includes('timeout')
      }
    );

    const flights = JSON.parse(result.content[0].text);
    console.log(`Found ${flights.totalResults} flight options`);

    // Filter based on preferences
    const preferredFlights = flights.flights.filter((flight: Flight) =>
      preferences.preferredAirlines.some(airline => 
        flight.airline.toLowerCase().includes(airline.toLowerCase())
      )
    );

    return preferredFlights.length > 0 ? preferredFlights : flights.flights;
  }

  private async getWeatherForecast(request: VacationRequest): Promise<WeatherInfo[]> {
    console.log('Getting weather forecast...');
    
    const result = await this.orchestrator.callTool('checkWeather', {
      destination: request.destination,
      startDate: request.departureDate,
      endDate: request.returnDate
    });

    const weather = JSON.parse(result.content[0].text);
    console.log(`Weather forecast: ${weather.forecast.length} days of data`);
    console.log(`Average temperature: ${weather.summary.avgTemperature}°C`);

    return weather.forecast;
  }

  private async findHotels(request: VacationRequest, preferences: TravelPreferences): Promise<Hotel[]> {
    console.log('Finding suitable hotels...');
    
    const result = await this.orchestrator.callTool('bookHotel', {
      location: request.destination,
      checkIn: request.departureDate,
      checkOut: request.returnDate,
      budget: request.budget * 0.4, // Allocate 40% of budget for hotels
      travelers: request.travelers
    });

    const hotels = JSON.parse(result.content[0].text);
    console.log(`Found ${hotels.availableCount} hotels within budget`);

    // Filter based on preferences
    const preferredHotels = hotels.hotels.filter((hotel: Hotel) =>
      preferences.hotelTypes.some(type => 
        hotel.name.toLowerCase().includes(type.toLowerCase()) ||
        hotel.amenities.some(amenity => 
          amenity.toLowerCase().includes(type.toLowerCase())
        )
      )
    );

    return preferredHotels.length > 0 ? preferredHotels : hotels.hotels;
  }

  private async checkCalendarAvailability(request: VacationRequest): Promise<any> {
    console.log('Checking calendar availability...');
    
    // First get available calendars
    const calendarsResult = await this.orchestrator.callTool('getAvailableCalendars', {});
    const calendars = JSON.parse(calendarsResult.content[0].text);
    
    if (calendars.totalCount === 0) {
      throw new Error('No calendars available');
    }

    const calendarId = calendars.calendars[0].id; // Use first available calendar
    
    const result = await this.orchestrator.callTool('getCalendarAvailability', {
      calendarId,
      startDate: request.departureDate,
      endDate: request.returnDate
    });

    const availability = JSON.parse(result.content[0].text);
    console.log(`Calendar availability: ${availability.isAvailable ? 'Available' : 'Conflicts detected'}`);

    return { ...availability, calendarId };
  }

  private async generateRecommendations(
    request: VacationRequest,
    flights: Flight[],
    hotels: Hotel[],
    weather: WeatherInfo[],
    userContext: { preferences: TravelPreferences; pastTrips: PastTrip[] }
  ): Promise<string[]> {
    console.log('Generating recommendations...');
    
    const recommendations: string[] = [];

    // Weather-based recommendations
    const avgTemp = weather.reduce((sum, w) => sum + w.temperature, 0) / weather.length;
    if (avgTemp > 25) {
      recommendations.push('Pack light, breathable clothing for warm weather');
    }
    if (avgTemp < 15) {
      recommendations.push('Bring warm layers for cooler temperatures');
    }

    // Budget recommendations
    const totalFlightCost = Math.min(...flights.map(f => f.price));
    const totalHotelCost = hotels.length > 0 ? hotels[0].totalPrice : 0;
    const totalCost = totalFlightCost + totalHotelCost;

    if (totalCost > request.budget * 0.8) {
      recommendations.push('Consider cheaper flight options to stay within budget');
    }

    // Past trip recommendations
    const relevantTrips = userContext.pastTrips.filter(trip =>
      trip.destination.toLowerCase().includes(request.destination.toLowerCase()) ||
      request.destination.toLowerCase().includes(trip.destination.toLowerCase())
    );

    if (relevantTrips.length > 0) {
      const topTrip = relevantTrips[0];
      recommendations.push(`Based on your ${topTrip.year} trip to ${topTrip.destination}, you might enjoy: ${topTrip.highlights.join(', ')}`);
    }

    // Preference-based recommendations
    if (userContext.preferences.dietaryRestrictions.includes('vegetarian')) {
      recommendations.push('Barcelona has excellent vegetarian restaurants in the Gothic Quarter');
    }

    return recommendations;
  }

  private async createItinerary(
    request: VacationRequest,
    flights: Flight[],
    hotels: Hotel[],
    weather: WeatherInfo[],
    calendarAvailability: any
  ): Promise<any> {
    console.log('Creating comprehensive itinerary...');
    
    // Create itinerary with selected flights and hotels
    const bestFlight = flights.length > 0 ? flights[0] : null;
    const bestHotel = hotels.length > 0 ? hotels[0] : null;

    const itinerary = {
      destination: request.destination,
      duration: this.calculateDays(request.departureDate, request.returnDate),
      flights: bestFlight ? [bestFlight] : [],
      hotels: bestHotel ? [bestHotel] : [],
      weather: weather.slice(0, 3), // First 3 days of weather
      calendarAvailable: calendarAvailability.isAvailable,
      bookingReference: `BK-${Date.now()}`,
      estimatedTotalCost: this.calculateTotalCost(flights, hotels),
      createdAt: new Date().toISOString()
    };

    // Create the itinerary using the travel server
    const result = await this.orchestrator.callTool('createItinerary', {
      destination: request.destination,
      flights: itinerary.flights,
      hotels: itinerary.hotels,
      activities: ['Sightseeing', 'Local dining', 'Beach time']
    });

    const travelItinerary = JSON.parse(result.content[0].text);
    console.log(`Itinerary created: ${travelItinerary.confirmationCode}`);

    return {
      ...itinerary,
      confirmationCode: travelItinerary.confirmationCode,
      status: travelItinerary.status
    };
  }

  private async finalizeBooking(request: VacationRequest, itinerary: any): Promise<void> {
    console.log('Finalizing booking...');
    
    // Schedule calendar events
    const calendarEvents = [
      {
        title: `${request.destination} Trip - Outbound`,
        description: `Departure for ${request.destination} vacation`,
        startDate: request.departureDate + 'T08:00:00Z',
        endDate: request.departureDate + 'T08:00:00Z',
        location: 'Airport'
      },
      {
        title: `${request.destination} Trip - Return`,
        description: `Return from ${request.destination} vacation`,
        startDate: request.returnDate + 'T20:00:00Z',
        endDate: request.returnDate + 'T20:00:00Z',
        location: 'Airport'
      }
    ];

    // Create calendar events
    for (const event of calendarEvents) {
      await this.orchestrator.callTool('createCalendarEvent', {
        calendarId: itinerary.calendarAvailable ? 'calendar://my-calendar/June-2024' : null,
        ...event
      });
    }

    // Schedule trip reminders
    await this.orchestrator.callTool('scheduleTripReminders', {
      calendarId: 'calendar://my-calendar/June-2024',
      tripEvents: calendarEvents,
      reminderDays: [7, 3, 1]
    });

    // Send confirmation email
    await this.orchestrator.callTool('sendEmail', {
      emailAccount: 'email://gmail/personal',
      to: 'user@gmail.com',
      subject: `Trip Confirmation: ${request.destination} (${request.departureDate} - ${request.returnDate})`,
      body: `Your trip to ${request.destination} has been planned!\n\nFlight: ${itinerary.flights[0]?.airline || 'TBD'}\nHotel: ${itinerary.hotels[0]?.name || 'TBD'}\nTotal Cost: $${itinerary.estimatedTotalCost}\nConfirmation: ${itinerary.confirmationCode}`
    });

    console.log('Calendar events scheduled and confirmation email sent');
  }

  private calculateTotalCost(flights: Flight[], hotels: Hotel[]): number {
    const flightCost = flights.length > 0 ? Math.min(...flights.map(f => f.price)) : 0;
    const hotelCost = hotels.length > 0 ? hotels[0].totalPrice : 0;
    return flightCost + hotelCost;
  }

  private calculateDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }
}