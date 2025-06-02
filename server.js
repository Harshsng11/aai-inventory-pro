require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// SQLite Database Setup
const db = new sqlite3.Database('inventory.db', (err) => {
    if (err) console.error('Error opening database:', err.message);
    console.log('Connected to SQLite database');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL
    )`);

    // Seed default admin user
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
        ['admin', hashedPassword, 'admin']);
    // Seed initial inventory items
    db.run(`INSERT OR IGNORE INTO inventory (id, name, quantity, price) VALUES (?, ?, ?, ?)`,
        [1, 'Laptop', 10, 999.99]);
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
        const user = jwt.verify(token, process.env.SECRET_KEY || 'your-secret-key');
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// API Routes
// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ username, role: user.role }, process.env.SECRET_KEY || 'your-secret-key', { expiresIn: '1h' });
        res.json({ token, role: user.role });
    });
});

// Get inventory items
app.get('/api/inventory', authenticateToken, (req, res) => {
    const { page = 1, limit = 5, sort = 'id', order = 'ASC', search = '' } = req.query;
    const offset = (page - 1) * limit;
    const searchQuery = `%${search}%`;

    const validSortFields = ['id', 'name', 'quantity', 'price'];
    const validOrders = ['ASC', 'DESC'];
    const sanitizedSort = validSortFields.includes(sort) ? sort : 'id';
    const sanitizedOrder = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'ASC';

    const query = `SELECT * FROM inventory WHERE name LIKE ? ORDER BY ${sanitizedSort} ${sanitizedOrder} LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total FROM inventory WHERE name LIKE ?`;

    db.get(countQuery, [searchQuery], (err, countRow) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.all(query, [searchQuery, parseInt(limit), parseInt(offset)], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ items: rows, total: countRow.total });
        });
    });
});

// Add a new item
app.post('/api/inventory', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { name, quantity, price } = req.body;
    if (!name || !quantity || !price) return res.status(400).json({ error: 'All fields are required' });
    const parsedQuantity = parseInt(quantity);
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) return res.status(400).json({ error: 'Quantity must be a non-negative number' });
    if (isNaN(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'Price must be a positive number' });

    db.run(`INSERT INTO inventory (name, quantity, price) VALUES (?, ?, ?)`, [name, parsedQuantity, parsedPrice], function (err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.status(201).json({ id: this.lastID, name, quantity: parsedQuantity, price: parsedPrice });
    });
});

// Bulk upload items
app.post('/api/inventory/bulk', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Items must be a non-empty array' });

    const stmt = db.prepare(`INSERT INTO inventory (name, quantity, price) VALUES (?, ?, ?)`);
    let inserted = 0;
    items.forEach(item => {
        const { name, quantity, price } = item;
        const parsedQuantity = parseInt(quantity);
        const parsedPrice = parseFloat(price);
        if (!name || isNaN(parsedQuantity) || parsedQuantity < 0 || isNaN(parsedPrice) || parsedPrice <= 0) return;
        stmt.run([name, parsedQuantity, parsedPrice], (err) => {
            if (err) console.error('Error during bulk insert:', err.message);
            else inserted++;
        });
    });
    stmt.finalize(() => {
        res.json({ message: `Successfully inserted ${inserted} items` });
    });
});

// Update an item
app.put('/api/inventory/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const id = parseInt(req.params.id);
    const { name, quantity, price } = req.body;
    if (!name || !quantity || !price) return res.status(400).json({ error: 'All fields are required' });
    const parsedQuantity = parseInt(quantity);
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) return res.status(400).json({ error: 'Quantity must be a non-negative number' });
    if (isNaN(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'Price must be a positive number' });

    db.run(`UPDATE inventory SET name = ?, quantity = ?, price = ? WHERE id = ?`, [name, parsedQuantity, parsedPrice, id], function (err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
        res.json({ id, name, quantity: parsedQuantity, price: parsedPrice });
    });
});

// Delete an item
app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const id = parseInt(req.params.id);
    db.run(`DELETE FROM inventory WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
        res.status(204).send();
    });
});

// Analytics endpoint
app.get('/api/inventory/analytics', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM inventory WHERE quantity < 5`, (err, lowStock) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ lowStock });
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});