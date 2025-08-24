import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import express from 'express';
// import { errorMiddleware } from './middleware';
import { routes } from './routes/index.js';

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(join(__dirname, '/public')));

// Register API routes
app.use('/api', routes);

// Serve the front end for any other route
app.get('*path', (req, res) => {
  res.sendFile(join(__dirname, '/public', 'index.html'));
});

// Apply error handling middleware
// app.use(errorMiddleware);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };