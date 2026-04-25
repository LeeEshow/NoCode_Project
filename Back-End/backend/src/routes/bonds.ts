/**
 * @deprecated 已由 /api/v1/foreign-assets 取代（Phase 3 重構）
 * 保留路由以避免舊前端呼叫時 404，未來確認前端切換完畢後可移除。
 */
import { Router } from 'express';
import * as ctrl from '../controllers/bondsController';

const router = Router();

router.get('/',     ctrl.getAll);
router.post('/',    ctrl.create);
router.put('/:id',  ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
