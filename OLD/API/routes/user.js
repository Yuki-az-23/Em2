const express = require('express');
const {userById , allUsers, getUser,updateUser,deleteUser,
    userPhoto,addFollowing,addFollower,removeFollowing,removeFollower ,updateECBrige} = require('../conttrollers/user');
const router = express.Router();
const {requireSignin} = require('../conttrollers/auth');


router.put('/user/follow',requireSignin,addFollowing,addFollower);
router.put('/user/unfollow',requireSignin,removeFollowing,removeFollower);
router.get('/users', allUsers);
router.get('/user/:userId',requireSignin, getUser);
router.put('/user/:userId',requireSignin,updateUser);
router.put('/user/ecbrige/:userId',requireSignin,updateECBrige);
router.delete('/user/:userId',requireSignin,deleteUser);
//any route containinig :userId,our app will first excute UserByID 
router.get('/user/photo/:userId',userPhoto)

router.param('userId',userById);
module.exports = router;