import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabaseSchema } from './src/server/db.js';
import { apiRouter } from './src/server/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Mount API router (both /api and direct /v1 routes)
app.use('/api', apiRouter);
app.use('/v1', (req, res, next) => {
  req.url = '/v1' + req.url;
  apiRouter(req, res, next);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'VCON License Engine',
    time: Date.now(),
  });
});

async function startServer() {
  try {
    console.log('[VCON] Initializing database schema...');
    await initDatabaseSchema();
    console.log('[VCON] Database schema initialized successfully.');

    // In development mode, attach Vite middlewares
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      // In production, serve static built files
      app.use(express.static(path.resolve(__dirname, 'dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[VCON] License Server running on http://0.0.0.0:${PORT}`);
      console.log(`[VCON] Admin Control Panel: http://0.0.0.0:${PORT}/vcon`);
    });
  } catch (error) {
    console.error('[VCON] Error starting server:', error);
    process.exit(1);
  }
}

startServer();
