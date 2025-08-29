import { exec } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { userConfig } from './conf/conf.js';
const ARTICLES_DIR = `${userConfig.get('ambDataPath')}/articles`;
console.log('Articles directory:', ARTICLES_DIR);

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

// Serve image files from the 'somewhere-data' directory under the '/data' path
app.use('/articles', express.static(ARTICLES_DIR));

// Register API routes
app.use('/api', routes);

// Serve the front end for any other route
// apparently this is REDUNDANT...
//
// app.get('*path', (req, res) => {
//   res.sendFile(join(__dirname, '/public', 'index.html'));
// });


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  let startCommand;

  switch (os.platform()) {
    case 'win32':
      startCommand = `start http://localhost:${PORT}`;
      break;
    case 'darwin':
      startCommand = `open http://localhost:${PORT}`;
      break;
    default:
      // For Linux or other OS, use xdg-open
      startCommand = `xdg-open http://localhost:${PORT}`;
      break;
  }

  if (process.env.NODE_ENV === 'production') {
    exec(startCommand, (error) => {
      if (error) {
        console.error(`Error opening browser: ${error.message}`);
        return;
      }
      console.log(`Opened http://localhost:${PORT} in your browser.`);
    });
  }
});

export { app };