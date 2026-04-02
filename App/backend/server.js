const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initializeDatabase } = require('./database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Маршруты API
const authRoutes = require('./routes/auth');
const referralRoutes = require('./routes/referral');
const subscriptionRoutes = require('./routes/subscription');

app.use('/api/auth', authRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Запуск сервера
async function startServer() {
    try {
        await initializeDatabase();
        console.log('Database initialized');

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
    }
}

startServer();