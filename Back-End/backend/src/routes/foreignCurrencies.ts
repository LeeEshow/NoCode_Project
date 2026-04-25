/**
 * @deprecated 已由 /api/v1/foreign-assets 取代（Phase 3 重構）
 * 保留路由以避免舊前端呼叫時 404，未來確認前端切換完畢後可移除。
 */
import { Router } from 'express';
import * as ctrl from '../controllers/foreignCurrenciesController';

const router = Router();

router.get('/',      ctrl.getAll);
router.put('/:code', ctrl.upsert);
router.delete('/:code', ctrl.remove);

export default router;
