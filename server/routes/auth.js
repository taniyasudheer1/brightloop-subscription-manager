const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health Check Route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Brightloop backend is up and running!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
module.exports = router;