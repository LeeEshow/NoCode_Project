import { Router } from 'express';
import * as ctrl from '../controllers/bondsController';

const router = Router();

router.get('/',     ctrl.getAll);
router.post('/',    ctrl.create);
router.put('/:id',  ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
