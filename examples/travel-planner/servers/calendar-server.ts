import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CalendarEvent } from "../types/index.js";

// Mock data for demonstration
const mockCalendarEvents: CalendarEvent[] = [
  {
    id: "CE001",
    title: "Barcelona Trip - Outbound Flight",
    description: "Flight to Barcelona for vacation",
    startDate: "2024-06-15T08:00:00Z",
    endDate: "2024-06-15T08:00:00Z",
    location: "JFK Airport, NYC"
  },
  {
    id: "CE002", 
    title: "Barcelona Trip - Return Flight",
    description: "Return flight from Barcelona",
    startDate: "2024-06-22T20:00:00Z",
    endDate: "2024-06-22T20:00:00Z",
    location: "Barcelona Airport"
  },
  {
    id: "CE003",
    title: "Team Standup Meeting",
    description: "Weekly team sync",
    startDate: "2024-06-14T09:00:00Z",
    endDate: "2024-06-14T09:30:00Z",
    location: "Conference Room A"
  }
];

const mockUserCalendars = [
  { id: "calendar://my-calendar/June-2024", name: "Personal Calendar - June 2024" },
  { id: "calendar://work/W2024-25", name: "Work Calendar - Week 25" },
  { id: "calendar://travel/2024", name: "Travel Calendar 2024" }
];

const mockEmailAccounts = [
  { id: "email://gmail/personal", name: "Personal Gmail", address: "user@gmail.com" },
  { id: "email://work/outlook", name: "Work Email", address: "user@company.com" }
];

// Create the server
const server = new Server(
  {
    name: "calendar-email-server", 
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
        name: "getCalendarAvailability",
        description: "Check calendar availability for date range",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: { type: "string", description: "Calendar ID to check" },
            startDate: { type: "string", description: "Start date (ISO format)" },
            endDate: { type: "string", description: "End date (ISO format)" }
          },
          required: ["calendarId", "startDate", "endDate"]
        }
      },
      {
        name: "createCalendarEvent",
        description: "Create a new calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: { type: "string", description: "Calendar ID to add event to" },
            title: { type: "string", description: "Event title" },
            description: { type: "string", description: "Event description" },
            startDate: { type: "string", description: "Start date (ISO format)" },
            endDate: { type: "string", description: "End date (ISO format)" },
            location: { type: "string", description: "Event location" }
          },
          required: ["calendarId", "title", "startDate", "endDate"]
        }
      },
      {
        name: "sendEmail",
        description: "Send an email message",
        inputSchema: {
          type: "object",
          properties: {
            emailAccount: { type: "string", description: "Email account to send from" },
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject" },
            body: { type: "string", description: "Email body content" },
            attachments: { type: "array", description: "Email attachments (file paths or URLs)" }
          },
          required: ["emailAccount", "to", "subject", "body"]
        }
      },
      {
        name: "getAvailableCalendars",
        description: "Get list of available calendars",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "getAvailableEmailAccounts",
        description: "Get list of available email accounts", 
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "scheduleTripReminders",
        description: "Schedule reminder notifications for trip events",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: { type: "string", description: "Calendar ID" },
            tripEvents: { type: "array", description: "Array of trip event objects" },
            reminderDays: { type: "array", description: "Days before event to send reminders" }
          },
          required: ["calendarId", "tripEvents", "reminderDays"]
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
      case "getCalendarAvailability":
        return await getCalendarAvailability(args);
      case "createCalendarEvent":
        return await createCalendarEvent(args);
      case "sendEmail":
        return await sendEmail(args);
      case "getAvailableCalendars":
        return await getAvailableCalendars();
      case "getAvailableEmailAccounts":
        return await getAvailableEmailAccounts();
      case "scheduleTripReminders":
        return await scheduleTripReminders(args);
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

async function getCalendarAvailability(args: any) {
  const { calendarId, startDate, endDate } = args;
  
  // Check if calendar exists
  const calendar = mockUserCalendars.find(cal => cal.id === calendarId);
  if (!calendar) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `Calendar ${calendarId} not found`,
            availableCalendars: mockUserCalendars
          })
        }
      ]
    };
  }

  // Filter events for the date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const availableEvents = mockCalendarEvents.filter(event => {
    const eventDate = new Date(event.startDate);
    return eventDate >= start && eventDate <= end;
  });

  // Check for conflicts (simplified logic)
  const conflicts = availableEvents.filter(event => {
    const eventStart = new Date(event.startDate);
    const eventEnd = new Date(event.endDate);
    // Assuming no conflicts if events are more than 4 hours apart
    return Math.abs(eventEnd.getTime() - start.getTime()) < 4 * 60 * 60 * 1000 ||
           Math.abs(end.getTime() - eventStart.getTime()) < 4 * 60 * 60 * 1000;
  });

  const isAvailable = conflicts.length === 0;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          calendarId,
          calendarName: calendar.name,
          dateRange: { startDate, endDate },
          isAvailable,
          conflicts: conflicts.length,
          conflictingEvents: conflicts,
          totalEvents: availableEvents.length
        })
      }
    ]
  };
}

async function createCalendarEvent(args: any) {
  const { calendarId, title, description, startDate, endDate, location } = args;
  
  // Check if calendar exists
  const calendar = mockUserCalendars.find(cal => cal.id === calendarId);
  if (!calendar) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `Calendar ${calendarId} not found`,
            availableCalendars: mockUserCalendars
          })
        }
      ]
    };
  }

  // Create new event
  const newEvent: CalendarEvent = {
    id: `CE${Date.now()}`,
    title,
    description: description || "",
    startDate,
    endDate,
    location: location || ""
  };

  // Add to mock events (in real implementation, this would save to actual calendar)
  mockCalendarEvents.push(newEvent);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          event: newEvent,
          calendar: calendar.name,
          status: "created",
          confirmationMessage: `Event "${title}" has been added to ${calendar.name}`
        })
      }
    ]
  };
}

async function sendEmail(args: any) {
  const { emailAccount, to, subject, body, attachments = [] } = args;
  
  // Check if email account exists
  const account = mockEmailAccounts.find(acc => acc.id === emailAccount);
  if (!account) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `Email account ${emailAccount} not found`,
            availableAccounts: mockEmailAccounts
          })
        }
      ]
    };
  }

  // Mock email sending
  const emailId = `EMAIL-${Date.now()}`;
  const emailData = {
    id: emailId,
    from: account.address,
    to,
    subject,
    body,
    attachments,
    sentAt: new Date().toISOString(),
    status: "sent"
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          email: emailData,
          status: "sent",
          confirmationMessage: `Email sent successfully from ${account.address} to ${to}`
        })
      }
    ]
  };
}

async function getAvailableCalendars() {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          calendars: mockUserCalendars,
          totalCount: mockUserCalendars.length
        })
      }
    ]
  };
}

async function getAvailableEmailAccounts() {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          accounts: mockEmailAccounts,
          totalCount: mockEmailAccounts.length
        })
      }
    ]
  };
}

async function scheduleTripReminders(args: any) {
  const { calendarId, tripEvents, reminderDays } = args;
  
  // Check if calendar exists
  const calendar = mockUserCalendars.find(cal => cal.id === calendarId);
  if (!calendar) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            error: `Calendar ${calendarId} not found`,
            availableCalendars: mockUserCalendars
          })
        }
      ]
    };
  }

  // Create reminder events for each trip event
  const reminderEvents = [];
  
  for (const event of tripEvents) {
    for (const daysBefore of reminderDays) {
      const reminderDate = new Date(event.startDate);
      reminderDate.setDate(reminderDate.getDate() - daysBefore);
      
      const reminderEvent: CalendarEvent = {
        id: `REM-${Date.now()}-${Math.random()}`,
        title: `Reminder: ${event.title}`,
        description: `Travel reminder - ${daysBefore} days before trip`,
        startDate: reminderDate.toISOString(),
        endDate: reminderDate.toISOString(),
        location: event.location
      };
      
      reminderEvents.push(reminderEvent);
      mockCalendarEvents.push(reminderEvent);
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          calendarId,
          calendarName: calendar.name,
          reminderEvents,
          totalReminders: reminderEvents.length,
          reminderDays,
          status: "scheduled",
          confirmationMessage: `${reminderEvents.length} reminder events scheduled for ${tripEvents.length} trip events`
        })
      }
    ]
  };
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Calendar/Email Server started");
}

if (require.main === module) {
  main();
}

export { server };