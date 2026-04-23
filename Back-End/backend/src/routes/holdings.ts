import { Router } from 'express';
import * as ctrl from '../controllers/holdingsController';

const router = Router();

router.get('/',                ctrl.getAll);
router.get('/:stockId',        ctrl.getById);
router.post('/recalculate',    ctrl.recalculate);

export default router;
