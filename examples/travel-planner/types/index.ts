// Shared types for the travel planning example

export interface VacationRequest {
  destination: string;
  departureDate: string;
  returnDate: string;
  budget: number;
  travelers: number;
}

export interface Flight {
  id: string;
  airline: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  duration: string;
}

export interface Hotel {
  id: string;
  name: string;
  location: string;
  checkIn: string;
  checkOut: string;
  pricePerNight: number;
  totalPrice: number;
  rating: number;
  amenities: string[];
}

export interface WeatherInfo {
  destination: string;
  date: string;
  temperature: number;
  condition: string;
  humidity: number;
  description: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
}

export interface TravelPreferences {
  preferredAirlines: string[];
  hotelTypes: string[];
  preferredSeating: string;
  dietaryRestrictions: string[];
}

export interface PastTrip {
  id: string;
  destination: string;
  year: number;
  rating: number;
  highlights: string[];
}

export interface TravelItinerary {
  flights: Flight[];
  hotels: Hotel[];
  weather: WeatherInfo[];
  totalCost: number;
  itinerary: CalendarEvent[];
}

export interface BookingConfirmation {
  confirmationNumber: string;
  bookingType: 'flight' | 'hotel' | 'complete_trip';
  details: any;
  status: 'confirmed' | 'pending' | 'failed';
}