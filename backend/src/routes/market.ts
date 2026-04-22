import { Router } from 'express';
import * as ctrl from '../controllers/marketController';

const router = Router();

router.get('/indices',          ctrl.getIndices);
router.get('/forex-rates',      ctrl.getForexRates);
router.get('/export-indicator', ctrl.getExportIndicator);

export default router;
