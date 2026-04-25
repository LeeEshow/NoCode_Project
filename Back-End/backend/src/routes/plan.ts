import { Router } from 'express';
import * as ctrl from '../controllers/planController';

const router = Router();

// 投報計畫設定（plan_config 單筆文件）
router.get('/config',                   ctrl.getPlanConfig);
router.put('/config',                   ctrl.updatePlanConfig);

// 舊版計畫設定（investment_plans，依 assetType）
router.get('/',                         ctrl.getPlan);
router.put('/',                         ctrl.updatePlan);

// 年度結算
router.get('/yearly-records',           ctrl.getYearlyRecords);
router.post('/yearly-records',          ctrl.createYearlyRecord);
router.put('/yearly-records/:year',     ctrl.updateYearlyRecord);

export default router;
