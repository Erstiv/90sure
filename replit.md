# replit.md

## Overview

Numbers! is a multiplayer trivia guessing game where players estimate numerical answers to questions within a range. Players compete by submitting low/high bounds for each question, and precision determines the winner. The game supports multiple categories (general, difficult) with predefined question sets stored in the schema.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state with polling (1-second intervals for multiplayer updates)
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom playful theme (purple/teal/pink palette), custom fonts (Architects Daughter for headings, DM Sans for body)
- **Animations**: Framer Motion for page transitions, canvas-confetti for celebration effects

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: REST endpoints with Zod validation for request/response schemas
- **Route Definitions**: Centralized in `shared/routes.ts` with typed API contracts
- **Build System**: Custom esbuild script that bundles server dependencies for faster cold starts

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions (games, players, guesses)
- **Migrations**: Drizzle Kit for schema management (`db:push` command)
- **Game State**: Three statuses (setup, playing, finished) with question progression tracking

### Key Design Decisions

1. **Shared Types Between Client/Server**: The `shared/` directory contains schema definitions and route contracts used by both frontend and backend, ensuring type safety across the stack.

2. **Polling for Multiplayer**: Uses 1-second polling interval on game state queries rather than WebSockets for simplicity, suitable for turn-based gameplay.

3. **Predefined Question Categories**: Questions are stored as constants in the schema file rather than in the database, making it easy to add/modify question sets without migrations.

4. **Custom Component Variants**: Both Shadcn/ui components and custom components (Button, Card, Input) with playful styling and animation support.

## External Dependencies

### Database
- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe queries
- connect-pg-simple for session storage capability

### Third-Party Libraries
- **UI**: Radix UI primitives, Lucide React icons
- **Validation**: Zod for runtime schema validation, drizzle-zod for database schema integration
- **Effects**: canvas-confetti for winner celebrations
- **Date Handling**: date-fns

### Development Tools
- Vite with React plugin and Replit-specific plugins (runtime error overlay, cartographer, dev banner)
- TypeScript with strict mode
- Tailwind CSS with PostCSS/Autoprefixer