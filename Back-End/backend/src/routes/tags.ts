import { Router } from 'express';
import * as ctrl from '../controllers/tagsController';

const router = Router();

router.get('/',     ctrl.getAll);
router.post('/',    ctrl.create);
router.post('/recalculate-dynamic-risk', ctrl.recalculateDynamic);
router.put('/:id',  ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
