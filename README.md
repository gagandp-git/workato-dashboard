# Insight Development Dashboard

An attractive, dynamic dashboard built with TypeScript and React to visualize Workato integration data.

## Features

- 📊 Real-time data visualization with interactive charts
- 🎨 Modern, gradient UI with smooth animations
- 📱 Fully responsive design
- ⚡ Dynamic data loading from CSV files
- 📈 Multiple chart types (Pie, Bar, Line)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Dashboard Sections

- **Stats Cards**: Overview of Connections, Jobs, Projects, and Recipes
- **Connection Distribution**: Pie chart showing connections by application
- **Job Status**: Bar chart of succeeded vs failed jobs
- **Recipe Performance**: Top 5 recipes with success/failure metrics
- **Projects Table**: Recent projects with details

The dashboard automatically loads and parses CSV data to provide dynamic insights.
