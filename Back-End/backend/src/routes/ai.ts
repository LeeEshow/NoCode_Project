import { Router } from 'express';
import * as ctrl from '../controllers/aiController';

const router = Router();

router.post('/daily-report', ctrl.generateDailyReport);
router.get('/daily-report', ctrl.getLatestDailyReport);
router.get('/daily-report/:date', ctrl.getDailyReportByDate);

export default router;
