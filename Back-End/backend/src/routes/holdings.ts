import { Router } from 'express';
import * as ctrl from '../controllers/holdingsController';

const router = Router();

router.get('/',             ctrl.getAll);
router.get('/prices',       ctrl.getPrices);     // 靜態路由須在 /:stockId 之前
router.get('/:stockId',     ctrl.getById);
router.put('/reorder',      ctrl.reorder);
router.post('/recalculate', ctrl.recalculate);

export default router;
