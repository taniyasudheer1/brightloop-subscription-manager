const { Pool } = require('pg');
require('dotenv').config();

// Create a connection pool using environment variables
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Alternatively, if using individual env variables:
    // host: process.env.DB_HOST,
    // user: process.env.DB_USER,
    // password: process.env.DB_PASSWORD,
    // database: process.env.DB_NAME,
    // port: process.env.DB_PORT || 5432,
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database successfully!');
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};