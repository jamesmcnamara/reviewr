# Reviewr Web App

This is a React web application for viewing diffs organized by tags. It provides a UI for exploring and reviewing code changes.

## Features

- View diffs organized by tags
- Expandable file diffs with syntax highlighting
- Priority indicators for changes
- GitHub-style diff view

## Getting Started

1. Install dependencies:
   ```
   cd web
   npm install
   ```

2. Start the development server:
   ```
   npm start
   ```

3. Build for production:
   ```
   npm run build
   ```

## Project Structure

- `src/components/` - React components
- `src/types.ts` - TypeScript interfaces
- `public/` - Static assets

## Connecting to Backend

The app expects a JSON file at `/diffs_for_tags.json` that contains the diff data organized by tags. In production, this would be replaced with an API endpoint.