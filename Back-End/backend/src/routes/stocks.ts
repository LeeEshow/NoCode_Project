import { Router } from 'express';
import * as ctrl from '../controllers/stocksController';

const router = Router();

router.get('/search',       ctrl.search);
router.get('/:id/quote',    ctrl.getQuote);
router.get('/:id/history',  ctrl.getHistory);
router.get('/:id/profile',  ctrl.getProfile);
router.get('/:id/chip',     ctrl.getChip);

export default router;
