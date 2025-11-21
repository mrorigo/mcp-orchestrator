import { TravelPlanner } from './travel-planner.js';
import { VacationRequest } from './types/index.js';

/**
 * Example usage of the MCP Travel Planner
 * 
 * This demonstrates the complete travel planning workflow described in the official MCP documentation:
 * "Multi-Server Travel Planning with three connected servers"
 * 
 * The workflow includes:
 * 1. User invokes vacation planning with parameters
 * 2. User selects resources to include (calendar, preferences, past trips)
 * 3. AI processes the request using multiple tools from different servers
 * 4. AI creates booking and following steps with user approval
 */

async function demonstrateTravelPlanning() {
  const planner = new TravelPlanner();
  
  try {
    console.log('🚀 Starting MCP Travel Planner Demo\n');
    
    // Initialize the orchestrator and connect to all servers
    await planner.initialize();
    
    // Define the vacation request (matching the official MCP documentation example)
    const vacationRequest: VacationRequest = {
      destination: "Barcelona",
      departureDate: "2024-06-15",
      returnDate: "2024-06-22", 
      budget: 3000,
      travelers: 2
    };

    console.log('📋 Vacation Request:');
    console.log(`   Destination: ${vacationRequest.destination}`);
    console.log(`   Dates: ${vacationRequest.departureDate} to ${vacationRequest.returnDate}`);
    console.log(`   Budget: $${vacationRequest.budget}`);
    console.log(`   Travelers: ${vacationRequest.travelers}`);
    console.log('\n' + '='.repeat(60) + '\n');

    // Execute the complete travel planning workflow
    const plan = await planner.planVacation(vacationRequest);
    
    // Display the comprehensive results
    console.log('\n🎯 COMPLETE TRAVEL PLAN RESULTS\n');
    console.log('=' .repeat(60));
    
    // Available flights
    console.log('✈️  AVAILABLE FLIGHTS:');
    plan.availableFlights.forEach((flight: any, index: number) => {
      console.log(`   ${index + 1}. ${flight.airline} - $${flight.price} (${flight.duration})`);
      console.log(`      ${flight.from} → ${flight.to} at ${flight.departureTime}`);
    });
    
    // Suitable hotels
    console.log('\n🏨 SUITABLE HOTELS:');
    plan.suitableHotels.forEach((hotel: any, index: number) => {
      console.log(`   ${index + 1}. ${hotel.name} - $${hotel.totalPrice} (${hotel.rating}⭐)`);
      console.log(`      ${hotel.location} - ${hotel.amenities.join(', ')}`);
    });
    
    // Weather forecast
    console.log('\n🌤️  WEATHER FORECAST:');
    plan.weatherForecast.slice(0, 3).forEach((weather: any) => {
      console.log(`   ${weather.date}: ${weather.temperature}°C, ${weather.condition}`);
      console.log(`      ${weather.description}`);
    });
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    plan.recommendations.forEach((rec: string, index: number) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
    
    // Next steps
    console.log('\n📋 NEXT STEPS:');
    plan.nextSteps.forEach((step: string, index: number) => {
      console.log(`   ${index + 1}. ${step}`);
    });
    
    // Total cost and confirmation
    console.log(`\n💰 ESTIMATED TOTAL COST: $${plan.totalEstimatedCost}`);
    console.log(`💳 BOOKING CONFIRMATION: ${plan.recommendedItinerary.confirmationCode}`);
    console.log(`📅 TRIP DURATION: ${plan.recommendedItinerary.duration} days`);
    
    // Calendar and email confirmations
    console.log('\n📅 CALENDAR EVENTS:');
    console.log('   ✅ Outbound flight added to calendar');
    console.log('   ✅ Return flight added to calendar');
    console.log('   ✅ Trip reminders scheduled (7, 3, 1 days before)');
    
    console.log('\n📧 EMAIL CONFIRMATION:');
    console.log('   ✅ Confirmation email sent to user@gmail.com');
    console.log(`   Subject: Trip Confirmation: ${vacationRequest.destination}`);
    
    console.log('\n🎉 TRAVEL PLANNING COMPLETE!');
    console.log('=' .repeat(60));
    console.log('\nThis example demonstrates how MCP enables:');
    console.log('• Multi-server coordination (Travel, Weather, Calendar/Email)');
    console.log('• Resource access (user preferences, past trips, calendar)');
    console.log('• Complex workflows using orchestration patterns');
    console.log('• Structured data flow across different services');
    
  } catch (error) {
    console.error('❌ Error during travel planning:', error);
  } finally {
    // Clean up connections
    await planner.disconnect();
    console.log('\n🔌 Disconnected from all MCP servers');
  }
}

// Run the example
if (require.main === module) {
  demonstrateTravelPlanning().catch(console.error);
}

export { demonstrateTravelPlanning };