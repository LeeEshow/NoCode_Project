import { Router } from 'express';
import * as ctrl from '../controllers/stocksController';

const router = Router();

// 靜態路由需在 /:id/* 動態路由之前
router.get('/search',          ctrl.search);
router.get('/list/meta',       ctrl.listMeta);
router.post('/list/refresh',   ctrl.listRefresh);
router.get('/:id/quote',       ctrl.getQuote);
router.get('/:id/history',     ctrl.getHistory);
router.get('/:id/profile',     ctrl.getProfile);
router.get('/:id/chip',        ctrl.getChip);

export default router;
