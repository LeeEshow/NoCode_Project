import { Router } from 'express';
import * as ctrl from '../controllers/planController';

const router = Router();

router.get('/',                         ctrl.getPlan);
router.put('/',                         ctrl.updatePlan);
router.get('/yearly-records',           ctrl.getYearlyRecords);
router.post('/yearly-records',          ctrl.createYearlyRecord);
router.put('/yearly-records/:year',     ctrl.updateYearlyRecord);

export default router;
