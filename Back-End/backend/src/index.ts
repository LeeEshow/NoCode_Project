import fs from 'fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import holdingsRouter          from './routes/holdings';
import transactionsRouter      from './routes/transactions';
import marketRouter            from './routes/market';
import planRouter              from './routes/plan';
import stocksRouter            from './routes/stocks';
import settingsRouter          from './routes/settings';
import foreignCurrenciesRouter from './routes/foreignCurrencies';
import bondsRouter             from './routes/bonds';
import foreignAssetsRouter     from './routes/foreignAssets';
import snapshotsRouter         from './routes/snapshots';
import watchlistRouter         from './routes/watchlist';
import preferencesRouter       from './routes/preferences';
import systemRouter            from './routes/system';

// ── 診斷 log（寫入 Azure LogFiles + stdout）──────────────────────────────
const LOG = '/home/LogFiles/node_app.log';
const log = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG, line); } catch {}
  process.stdout.write(line);
};

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.stack ?? err.message}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${String(reason)}`);
  process.exit(1);
});

log('Process starting...');

// ── App 初始化 ────────────────────────────────────────────────────────────
dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

const api = '/api/v1';
app.use(`${api}/holdings`,            holdingsRouter);
app.use(`${api}/transactions`,        transactionsRouter);
app.use(`${api}/market`,              marketRouter);
app.use(`${api}/plan`,                planRouter);
app.use(`${api}/stocks`,              stocksRouter);
app.use(`${api}/settings`,            settingsRouter);
app.use(`${api}/foreign-currencies`,  foreignCurrenciesRouter);
app.use(`${api}/bonds`,               bondsRouter);
app.use(`${api}/foreign-assets`,      foreignAssetsRouter);
app.use(`${api}/snapshots`,           snapshotsRouter);
app.use(`${api}/watchlist`,           watchlistRouter);
app.use(`${api}/preferences`,         preferencesRouter);
app.use(`${api}/system`,              systemRouter);

app.use(errorHandler);

const port = process.env.PORT ?? 3001;
log(`Calling app.listen on port ${port}...`);
app.listen(port, () => log(`Server running on port ${port}`));
