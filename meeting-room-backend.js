// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

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

// Routes

// GET all bookings
app.get('/api/bookings', (req, res) => {
  const query = 'SELECT * FROM bookings ORDER BY date, startTime';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    res.json(rows);
  });
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
  
  // Validation
  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Check for time conflicts
  const conflictQuery = `
    SELECT * FROM bookings 
    WHERE date = ? AND (
      (startTime <= ? AND endTime > ?) OR
      (startTime < ? AND endTime >= ?) OR
      (startTime >= ? AND endTime <= ?)
    )
  `;
  
  db.get(conflictQuery, [date, startTime, startTime, endTime, endTime, startTime, endTime], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    if (row) {
      return res.status(409).json({ error: 'Time slot conflict' });
    }
    
    // Insert new booking
    const insertQuery = `
      INSERT INTO bookings (title, date, startTime, endTime, attendees, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(insertQuery, [title, date, startTime, endTime, attendees, notes], function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error' });
        return;
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

// PUT update booking
app.put('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const { title, date, startTime, endTime, attendees, notes } = req.body;
  
  // Validation
  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Check for time conflicts (excluding current booking)
  const conflictQuery = `
    SELECT * FROM bookings 
    WHERE date = ? AND id != ? AND (
      (startTime <= ? AND endTime > ?) OR
      (startTime < ? AND endTime >= ?) OR
      (startTime >= ? AND endTime <= ?)
    )
  `;
  
  db.get(conflictQuery, [date, id, startTime, startTime, endTime, endTime, startTime, endTime], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    if (row) {
      return res.status(409).json({ error: 'Time slot conflict' });
    }
    
    // Update booking
    const updateQuery = `
      UPDATE bookings 
      SET title = ?, date = ?, startTime = ?, endTime = ?, attendees = ?, notes = ?
      WHERE id = ?
    `;
    
    db.run(updateQuery, [title, date, startTime, endTime, attendees, notes, id], function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error' });
        return;
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      
      res.json({
        id: parseInt(id),
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
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({ message: 'Booking deleted successfully' });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});

module.exports = app;
