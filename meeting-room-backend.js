const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create a new PostgreSQL pool
// The DATABASE_URL environment variable will be provided by Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Function to create the bookings table if it doesn't exist, enforcing camelCase
const createTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      "startTime" TEXT NOT NULL,
      "endTime" TEXT NOT NULL,
      attendees INTEGER,
      notes TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log('Table "bookings" is ready.');
  } catch (err) {
    console.error('Error creating table:', err);
  }
};

// Create the table on server startup
createTable();

// GET bookings for a specific date
app.get('/api/bookings/:date', async (req, res) => {
  const { date } = req.params;
  try {
    // Use quoted column names to ensure correct casing
    const result = await pool.query('SELECT * FROM bookings WHERE date = $1 ORDER BY "startTime"', [date]);
    res.json(result.rows);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST create new booking
app.post('/api/bookings', async (req, res) => {
  const { title, date, startTime, endTime, attendees, notes } = req.body;
  
  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Use quoted column names
  const conflictQuery = `
    SELECT * FROM bookings 
    WHERE date = $1 AND (
      ("startTime" < $2 AND "endTime" > $3) OR 
      ("startTime" >= $3 AND "startTime" < $2)
    )
  `;

  try {
    const conflictResult = await pool.query(conflictQuery, [date, endTime, startTime]);
    if (conflictResult.rows.length > 0) {
      return res.status(409).json({ error: 'Time slot conflict' });
    }

    // Use quoted column names
    const insertQuery = `
      INSERT INTO bookings (title, date, "startTime", "endTime", attendees, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const newBooking = await pool.query(insertQuery, [title, date, startTime, endTime, attendees, notes]);
    res.status(201).json(newBooking.rows[0]);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE booking
app.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ message: 'Booking deleted successfully' });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
