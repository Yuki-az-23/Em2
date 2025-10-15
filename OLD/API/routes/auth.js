
const express = require('express');
const {signup , signin , signout} = require('../conttrollers/auth');
const {userById} = require('../conttrollers/user');
const router = express.Router();
const {userSignupValidator} = require('../validator')


router.post('/signup',userSignupValidator,signup);
router.post('/signin', signin);
router.post('/signout', signout);
router.get('/signout', signout);
//any route containinig :userId,our app will first excute UserByID 

router.param('userId',userById)
module.exports = router;