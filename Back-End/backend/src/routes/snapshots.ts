import { Router } from 'express';
import * as ctrl from '../controllers/snapshotsController';

const router = Router();

router.get('/',          ctrl.getAll);      // ?year=2025 篩選
router.post('/',         ctrl.create);      // 前端送入快照資料（不含計算邏輯）
router.get('/:date',     ctrl.getByDate);
router.put('/:date',     ctrl.update);
router.post('/record',   ctrl.record);      // 保留：後端自動計算快照（舊端點）

export default router;
