import { Router } from 'express';
import * as ctrl from '../controllers/watchlistController';

const router = Router();

router.get('/',            ctrl.getAll);
router.post('/',           ctrl.create);
router.put('/reorder',     ctrl.reorder);
router.put('/:stockId',    ctrl.update);
router.delete('/:stockId', ctrl.remove);

export default router;
