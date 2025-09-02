import { exec } from 'child_process';
import os from 'os';
import { join, basename } from 'path';

import { userConfig } from './conf/conf.js';
const repoName = userConfig.get('githubRepo');
const basePath = userConfig.get('basePath');
const articlesPath = join(basePath, basename(repoName, '.git'), 'articles');
console.log('Articles directory:', articlesPath);

import express from 'express';
import { routes } from './routes/index.js';

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(join(process.cwd(), 'public')));

// Serve image files from the 'somewhere-data' directory under the '/data' path
app.use('/articles', express.static(articlesPath));

// Register API routes
app.use('/api', routes);

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

  if (process.env.NODE_ENV !== 'development') {
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