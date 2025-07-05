// meeting-room-backend.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('./bookings.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create bookings table if it doesn't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    attendees INTEGER,
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// GET bookings for a specific date
app.get('/api/bookings/:date', (req, res) => {
  const { date } = req.params;
  const query = 'SELECT * FROM bookings WHERE date = ? ORDER BY startTime';
  
  db.all(query, [date], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    res.json(rows);
  });
});

// POST create new booking
app.post('/api/bookings', (req, res) => {
  const { title, date, startTime, endTime, attendees, notes } = req.body;
  
  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const conflictQuery = `
    SELECT * FROM bookings 
    WHERE date = ? AND (
      (startTime < ? AND endTime > ?) OR
      (startTime < ? AND endTime > ?) OR
      (startTime >= ? AND endTime <= ?)
    )
  `;
  
  db.get(conflictQuery, [date, endTime, startTime, startTime, endTime, startTime, endTime], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (row) {
      return res.status(409).json({ error: 'Time slot conflict' });
    }
    
    const insertQuery = `
      INSERT INTO bookings (title, date, startTime, endTime, attendees, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(insertQuery, [title, date, startTime, endTime, attendees, notes], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.status(201).json({
        id: this.lastID,
        title,
        date,
        startTime,
        endTime,
        attendees,
        notes
      });
    });
  });
});

// DELETE booking
app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const deleteQuery = 'DELETE FROM bookings WHERE id = ?';
  
  db.run(deleteQuery, [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({ message: 'Booking deleted successfully' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
