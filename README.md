# CS2 Fantasy Esports App

A full-stack Counter-Strike 2 fantasy esports web application with leagues, team builder, match simulations, and leaderboards.

## Tech Stack

- **Frontend**: Vite + React 18, React Router v6, CSS Modules (plain CSS files), Fetch API
- **Backend**: Node.js, Express, SQLite (better-sqlite3), bcrypt, JSON Web Tokens (JWT), CORS, Multer

## Project Structure

- `client/` – Vite + React frontend
- `server/` – Node.js + Express backend with SQLite
- `data/` – Static JSON data for players, teams, and scenarios

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the project root:

```bash
JWT_SECRET=your-secret-key-here
PORT=5000
```

### 2. Backend Setup

```bash
cd server
npm install
npm start
```

The backend will start on `http://localhost:5000`.

### 3. Frontend Setup

```bash
cd client
npm install
npm run dev
```

The frontend will start on `http://localhost:5173`.

## Default Admin Credentials

- **Username**: `admin`
- **Password**: `admin123`

These credentials are inserted automatically into the database on first server startup if no admin user exists.

## Basic Flow to Test

1. Start backend: `cd server && npm install && npm start`
2. Start frontend: `cd client && npm install && npm run dev`
3. Register a new user at `http://localhost:5173`
4. Login with the new user
5. Create a league
6. Build a fantasy team (select 5 players within budget)
7. Login as admin (`admin` / `admin123`)
8. Simulate matches from the admin dashboard
9. View league leaderboard

