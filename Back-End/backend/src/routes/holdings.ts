import { Router } from 'express';
import * as ctrl from '../controllers/holdingsController';
import * as assetTagsCtrl from '../controllers/assetTagsController';

const router = Router();

router.get('/',             ctrl.getAll);
router.get('/prices',       ctrl.getPrices);     // 靜態路由須在 /:stockId 之前
router.get('/:stockId',     ctrl.getById);
router.put('/reorder',      ctrl.reorder);
router.post('/recalculate', ctrl.recalculate);

// 持股 Tag 嵌套路由（須在 /:stockId 後，方法不同無衝突）
router.post('/:stockCode/tags',       assetTagsCtrl.createForHolding);
router.put('/:stockCode/tags/:id',    assetTagsCtrl.update);
router.delete('/:stockCode/tags/:id', assetTagsCtrl.remove);

export default router;
