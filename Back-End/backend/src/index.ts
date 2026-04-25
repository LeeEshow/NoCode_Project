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

app.use(errorHandler);

const port = process.env.PORT ?? 3001;
app.listen(port, () => console.log(`Server running on port ${port}`));
